import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ensureProfileRow,
  fetchProfile,
  markPaywallSeen,
  markTutorialSeen,
  reconcileStripeSubscription,
  resetTutorialForReplay,
} from '../lib/profileApi'
import { FREE_AI_GENERATION_LIMIT, hasPremiumAccess, type Profile } from '../types/profile'

type ProfileContextValue = {
  profile: Profile | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  applyUsageSnapshot: (snapshot: { usageCount: number; isPro: boolean }) => void
  completeTutorial: () => Promise<boolean>
  replayTutorialFromSettings: () => Promise<boolean>
  acknowledgePaywallSeen: () => Promise<boolean>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

type ProviderProps = {
  children: ReactNode
  userId: string
  email: string | null
  client: SupabaseClient
}

export function ProfileProvider({ children, userId, email, client }: ProviderProps) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const usageShadowKey = `trackora_usage_shadow_${userId}`

  const readUsageShadow = useCallback((): number | null => {
    try {
      const raw = window.localStorage.getItem(usageShadowKey)
      if (!raw) return null
      const n = Number(raw)
      if (!Number.isFinite(n)) return null
      return Math.max(0, Math.floor(n))
    } catch {
      return null
    }
  }, [usageShadowKey])

  const writeUsageShadow = useCallback(
    (count: number) => {
      try {
        window.localStorage.setItem(usageShadowKey, String(Math.max(0, Math.floor(count))))
      } catch {
        // ignore storage errors
      }
    },
    [usageShadowKey],
  )

  const refresh = useCallback(async () => {
    setError(null)
    let ensured = await ensureProfileRow(client, userId, email)
    if (!ensured) {
      setProfile(null)
      setError('Could not load your profile.')
      setLoading(false)
      return
    }
    if (ensured.stripe_customer_id?.trim() || ensured.stripe_subscription_id?.trim()) {
      await reconcileStripeSubscription(client)
      const refreshed = await fetchProfile(client, userId)
      if (refreshed) ensured = refreshed
    }
    const shadow = readUsageShadow()
    const mergedUsage =
      hasPremiumAccess(ensured) || shadow == null
        ? ensured.usage_count
        : Math.min(FREE_AI_GENERATION_LIMIT, Math.max(ensured.usage_count, shadow))
    if (!hasPremiumAccess(ensured) && mergedUsage > ensured.usage_count && import.meta.env.DEV) {
      console.log('[usage] applying local shadow count while waiting for server sync:', mergedUsage)
    }
    setProfile({ ...ensured, usage_count: mergedUsage })
    setLoading(false)
  }, [client, userId, email, readUsageShadow])

  useEffect(() => {
    setLoading(true)
    void refresh()
  }, [refresh])

  const applyUsageSnapshot = useCallback((snapshot: { usageCount: number; isPro: boolean }) => {
    setProfile((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        is_pro: snapshot.isPro,
        usage_count: Number.isFinite(snapshot.usageCount)
          ? Math.trunc(snapshot.usageCount)
          : prev.usage_count,
      }
    })
  }, [])

  const completeTutorial = useCallback(async () => {
    const result = await markTutorialSeen(client)
    await refresh()
    return result.ok
  }, [client, refresh])

  const replayTutorialFromSettings = useCallback(async () => {
    const result = await resetTutorialForReplay(client)
    await refresh()
    return result.ok
  }, [client, refresh])

  const acknowledgePaywallSeen = useCallback(async () => {
    const result = await markPaywallSeen(client)
    await refresh()
    return result.ok
  }, [client, refresh])

  const value = useMemo(
    () => ({
      profile,
      loading,
      error,
      refresh,
      applyUsageSnapshot,
      completeTutorial,
      replayTutorialFromSettings,
      acknowledgePaywallSeen,
    }),
    [
      profile,
      loading,
      error,
      refresh,
      applyUsageSnapshot,
      completeTutorial,
      replayTutorialFromSettings,
      acknowledgePaywallSeen,
    ],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext)
  if (!ctx) {
    throw new Error('useProfile must be used within ProfileProvider')
  }
  return ctx
}
