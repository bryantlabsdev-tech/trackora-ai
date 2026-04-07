import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile, ProfileRow } from '../types/profile'

function mapRow(row: ProfileRow): Profile {
  return { ...row }
}

export async function fetchProfile(client: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle()

  if (error) {
    console.error('[profiles] fetch', error.message)
    return null
  }
  if (!data) return null
  return mapRow(data as ProfileRow)
}

/**
 * Ensures a profile row exists (first login or before trigger exists).
 * Does not overwrite existing rows.
 */
export async function ensureProfileRow(
  client: SupabaseClient,
  userId: string,
  email: string | null,
): Promise<Profile | null> {
  const existing = await fetchProfile(client, userId)
  if (existing) return existing

  const { error: insertError } = await client.from('profiles').insert({
    id: userId,
    email: email?.trim() ?? '',
  })

  if (insertError && insertError.code !== '23505') {
    console.error('[profiles] insert', insertError.message)
    return null
  }

  return fetchProfile(client, userId)
}

/** Call after a successful OpenAI-backed generation; RPC no-ops for Pro users. */
export async function incrementAiUsage(client: SupabaseClient): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client.rpc('increment_ai_usage')
  if (error) {
    console.error('[profiles] increment_ai_usage', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
