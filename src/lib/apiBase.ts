/** Production API origin — no trailing slash. */
const DEFAULT_API_BASE = 'https://trackora-ai.onrender.com'

/** Express route for coaching AI — must match server `app.post('/api/ai', ...)`. */
const COACHING_AI_SUFFIX = '/api/ai'

function viteApiBaseTrimmed(): string {
  const raw = import.meta.env.VITE_API_BASE_URL
  return typeof raw === 'string' ? raw.trim().replace(/\/$/, '') : ''
}

/**
 * Single resolved API origin for all server calls (checkout, billing, coaching).
 * - `VITE_API_BASE_URL` when set (absolute URL or `/api`-style path for dev proxy).
 * - Dev + unset → local Express (`npm run dev` runs API on 3001).
 * - Production build + unset → Render default.
 */
export function getApiBase(): string {
  const trimmed = viteApiBaseTrimmed()
  if (trimmed !== '') return trimmed
  if (import.meta.env.DEV) return 'http://127.0.0.1:3001'
  return DEFAULT_API_BASE
}

/**
 * Full URL for `POST /api/ai`. Same base resolution as `getApiBase()`.
 */
export function getCoachingApiUrl(): string {
  const base = getApiBase()
  if (base === '/api' || base.endsWith('/api')) {
    return `${base}/ai`
  }
  return `${base}${COACHING_AI_SUFFIX}`
}

export function getCreateCheckoutSessionUrl(): string {
  return `${getApiBase()}/create-checkout-session`
}

export function getCreateBillingPortalSessionUrl(): string {
  return `${getApiBase()}/api/create-customer-portal-session`
}

export function getBillingReconcileUrl(): string {
  return `${getApiBase()}/api/billing/reconcile-subscription`
}
