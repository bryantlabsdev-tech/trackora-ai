import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureProfileRow, incrementAiUsage } from '../lib/profileApi'
import type { Profile } from '../types/profile'

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

  const refresh = useCallback(async () => {
    setError(null)
    const ensured = await ensureProfileRow(client, userId, email)
    if (!ensured) {
      setProfile(null)
      setError('Could not load your profile.')
      setLoading(false)
      return
    }
    setProfile(ensured)
    setLoading(false)
  }, [client, userId, email])

  useEffect(() => {
    setLoading(true)
    void refresh()
  }, [refresh])

  const recordOpenAiGeneration = useCallback(async () => {
    await incrementAiUsage(client)
    await refresh()
  }, [client, refresh])

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
