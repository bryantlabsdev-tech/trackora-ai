import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { resolveSupabaseClientEnv } from '../../shared/supabaseClientEnv.mjs'

const viteEnv = import.meta.env as ImportMetaEnv

const resolved = resolveSupabaseClientEnv({
  VITE_SUPABASE_URL: viteEnv.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY,
  VITE_SUPABASE_ANON_KEY: viteEnv.VITE_SUPABASE_ANON_KEY,
  SUPABASE_URL: viteEnv.SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: viteEnv.NEXT_PUBLIC_SUPABASE_URL,
})

export const isSupabaseConfigured = resolved.ok

/** Human-readable issues when sign-in cannot run (shown in UI + console). */
export const supabaseConfigErrors = resolved.ok ? [] : resolved.errors

export const supabaseConfigHostname = resolved.ok ? resolved.hostname : resolved.hostname

/** Null when env vars are missing or invalid — check `isSupabaseConfigured` before use. */
export const supabase: SupabaseClient | null = resolved.ok
  ? createClient(resolved.url, resolved.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

if (!resolved.ok && import.meta.env.PROD) {
  console.error(
    '[trackora] Supabase is not configured for production:\n',
    resolved.errors.map(e => `  - ${e}`).join('\n'),
  )
}
