import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureProfileRow, incrementAiUsage } from '../lib/profileApi'
import { FREE_AI_GENERATION_LIMIT, type Profile } from '../types/profile'

type ProfileContextValue = {
  profile: Profile | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  recordOpenAiGeneration: () => Promise<void>
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
    const ensured = await ensureProfileRow(client, userId, email)
    if (!ensured) {
      setProfile(null)
      setError('Could not load your profile.')
      setLoading(false)
      return
    }
    const shadow = readUsageShadow()
    const mergedUsage =
      ensured.is_pro || shadow == null ? ensured.usage_count : Math.min(FREE_AI_GENERATION_LIMIT, Math.max(ensured.usage_count, shadow))
    if (!ensured.is_pro && mergedUsage > ensured.usage_count) {
      console.log('[usage] applying local shadow count while waiting for server sync:', mergedUsage)
    }
    setProfile({ ...ensured, usage_count: mergedUsage })
    setLoading(false)
  }, [client, userId, email, readUsageShadow])

  useEffect(() => {
    setLoading(true)
    void refresh()
  }, [refresh])

  const recordOpenAiGeneration = useCallback(async () => {
    let localCountForSync: number | null = null
    // Immediate UI response + persistence fallback so free limit is enforced even if RPC is down.
    setProfile((prev) => {
      if (!prev || prev.is_pro) return prev
      const next = Math.min(FREE_AI_GENERATION_LIMIT, prev.usage_count + 1)
      localCountForSync = next
      writeUsageShadow(next)
      return { ...prev, usage_count: next }
    })

    const result = await incrementAiUsage(client)
    if (!result.ok) {
      console.error('[usage] incrementAiUsage failed; using local shadow until server sync works')
    } else {
      console.log('[usage] incrementAiUsage succeeded')
    }

    await refresh()
    if (localCountForSync != null && result.ok) {
      try {
        const latestShadow = readUsageShadow()
        if (latestShadow != null && latestShadow <= localCountForSync) {
          window.localStorage.removeItem(usageShadowKey)
        }
      } catch {
        // ignore
      }
    }
  }, [client, refresh, readUsageShadow, usageShadowKey, writeUsageShadow])

  const value = useMemo(
    () => ({
      profile,
      loading,
      error,
      refresh,
      recordOpenAiGeneration,
    }),
    [profile, loading, error, refresh, recordOpenAiGeneration],
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
