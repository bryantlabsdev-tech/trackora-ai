/** Production API origin — no trailing slash. */
const DEFAULT_API_BASE = 'https://trackora-ai.onrender.com'

/** Express route for coaching — must match server `app.post('/api/ai', ...)`. */
const COACHING_AI_PATH = '/api/ai'

function viteApiBaseTrimmed(): string {
  const raw = import.meta.env.VITE_API_BASE_URL
  return typeof raw === 'string' ? raw.trim().replace(/\/$/, '') : ''
}

export function getApiBase(): string {
  const trimmed = viteApiBaseTrimmed()
  return trimmed !== '' ? trimmed : DEFAULT_API_BASE
}

/**
 * Coaching AI endpoint. Uses `VITE_API_BASE_URL` when set (no trailing slash).
 * If the base is already `/api` or ends with `/api`, appends `/ai` only (avoids `/api/api/ai`).
 * In Vite dev with no base, uses same-origin `/api/ai` for the proxy to Express.
 */
export function getCoachingApiUrl(): string {
  const trimmed = viteApiBaseTrimmed()
  if (trimmed === '') {
    if (import.meta.env.DEV) return COACHING_AI_PATH
    return `${DEFAULT_API_BASE}${COACHING_AI_PATH}`
  }
  if (trimmed === '/api' || trimmed.endsWith('/api')) {
    return `${trimmed}/ai`
  }
  return `${trimmed}${COACHING_AI_PATH}`
}

export function getCreateCheckoutSessionUrl(): string {
  return `${getApiBase()}/create-checkout-session`
}
