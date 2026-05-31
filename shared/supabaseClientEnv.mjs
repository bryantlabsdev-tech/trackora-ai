/**
 * Resolve and validate Supabase client env (Vite: VITE_* only at runtime).
 * Used by src/lib/supabase.ts and vite.config.ts build checks.
 */

const PLACEHOLDER_HOST_RE = /placeholder|your_project|your_staging|example\.supabase/i

/** @typedef {{ ok: true; url: string; key: string; hostname: string } | { ok: false; errors: string[]; warnings: string[]; url?: string; hostname?: string }} SupabaseClientEnvResult */

/**
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function detectMisconfiguredSupabaseEnvKeys(env) {
  const hints = []
  if (env.SUPABASE_URL?.trim() && !env.VITE_SUPABASE_URL?.trim()) {
    hints.push(
      'SUPABASE_URL is set but VITE_SUPABASE_URL is missing. Vite only exposes VITE_* to the browser — duplicate the project URL as VITE_SUPABASE_URL in Vercel.',
    )
  }
  if (env.NEXT_PUBLIC_SUPABASE_URL?.trim() && !env.VITE_SUPABASE_URL?.trim()) {
    hints.push('NEXT_PUBLIC_SUPABASE_URL is set; this app expects VITE_SUPABASE_URL.')
  }
  return hints
}

/**
 * @param {string} url
 */
export function validateSupabaseProjectUrl(url) {
  const trimmed = url.trim()
  if (!trimmed) {
    return { valid: false, reason: 'VITE_SUPABASE_URL is empty' }
  }
  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    return { valid: false, reason: 'VITE_SUPABASE_URL is not a valid URL' }
  }
  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: 'VITE_SUPABASE_URL must start with https://' }
  }
  if (!parsed.hostname.endsWith('.supabase.co')) {
    return {
      valid: false,
      reason: `VITE_SUPABASE_URL hostname must be *.supabase.co (got "${parsed.hostname}")`,
      hostname: parsed.hostname,
    }
  }
  if (PLACEHOLDER_HOST_RE.test(trimmed) || PLACEHOLDER_HOST_RE.test(parsed.hostname)) {
    return {
      valid: false,
      reason: 'VITE_SUPABASE_URL looks like a template or CI placeholder',
      hostname: parsed.hostname,
    }
  }
  return { valid: true, hostname: parsed.hostname }
}

/**
 * @param {string} key
 */
export function validateSupabaseAnonKey(key) {
  const trimmed = key.trim()
  if (!trimmed) {
    return { valid: false, reason: 'VITE_SUPABASE_PUBLISHABLE_KEY is empty' }
  }
  if (trimmed === 'placeholder-anon-key') {
    return { valid: false, reason: 'VITE_SUPABASE_PUBLISHABLE_KEY is the CI placeholder' }
  }
  if (trimmed.length < 20) {
    return { valid: false, reason: 'VITE_SUPABASE_PUBLISHABLE_KEY looks too short' }
  }
  return { valid: true }
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {SupabaseClientEnvResult}
 */
export function resolveSupabaseClientEnv(env) {
  const warnings = detectMisconfiguredSupabaseEnvKeys(env)
  const urlRaw = env.VITE_SUPABASE_URL?.trim() ?? ''
  const keyRaw = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '').trim()
  const errors = []

  if (!urlRaw) {
    errors.push('VITE_SUPABASE_URL is not set.')
  }
  if (!keyRaw) {
    errors.push('VITE_SUPABASE_PUBLISHABLE_KEY is not set (anon key from Supabase → Settings → API).')
  }

  if (urlRaw) {
    const urlCheck = validateSupabaseProjectUrl(urlRaw)
    if (!urlCheck.valid) errors.push(urlCheck.reason)
  }
  if (keyRaw) {
    const keyCheck = validateSupabaseAnonKey(keyRaw)
    if (!keyCheck.valid) errors.push(keyCheck.reason)
  }

  if (errors.length > 0) {
    let hostname
    if (urlRaw) {
      try {
        hostname = new URL(urlRaw).hostname
      } catch {
        hostname = undefined
      }
    }
    return { ok: false, errors, warnings, url: urlRaw || undefined, hostname }
  }

  const urlCheck = validateSupabaseProjectUrl(urlRaw)
  return {
    ok: true,
    url: urlRaw.replace(/\/+$/, ''),
    key: keyRaw,
    hostname: urlCheck.hostname,
    warnings,
  }
}

/**
 * @param {Record<string, string | undefined>} env
 */
export function formatSupabaseBuildEnvLog(env) {
  const resolved = resolveSupabaseClientEnv(env)
  const lines = ['[trackora] Supabase client env (build)']
  if (resolved.ok) {
    lines.push(`  VITE_SUPABASE_URL → https://${resolved.hostname} (ok)`)
    lines.push(`  VITE_SUPABASE_PUBLISHABLE_KEY → set (${resolved.key.length} chars)`)
  } else {
    lines.push(`  VITE_SUPABASE_URL → ${resolved.hostname ?? resolved.url ?? '(missing)'}`)
    lines.push(`  VITE_SUPABASE_PUBLISHABLE_KEY → ${env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ? 'set' : 'MISSING'}`)
    for (const e of resolved.errors) lines.push(`  ✗ ${e}`)
  }
  for (const w of resolved.warnings ?? []) lines.push(`  ⚠ ${w}`)
  return lines.join('\n')
}

/**
 * Fail production deploy builds when Supabase client env is missing or invalid.
 * @param {Record<string, string | undefined>} env
 */
export function assertSupabaseClientEnvForDeploy(env) {
  const isVercel = env.VERCEL === '1' || process.env.VERCEL === '1'
  const isCiPlaceholder = env.VITE_SUPABASE_URL?.includes('placeholder.supabase.co')
  if (!isVercel) return
  if (isCiPlaceholder) {
    throw new Error(
      '[trackora] Vercel build has placeholder Supabase URL. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Vercel → Project → Settings → Environment Variables (Production).',
    )
  }
  const resolved = resolveSupabaseClientEnv(env)
  if (!resolved.ok) {
    throw new Error(
      `[trackora] Invalid Supabase client env for Vercel build:\n${resolved.errors.map((e) => `  - ${e}`).join('\n')}`,
    )
  }
}
