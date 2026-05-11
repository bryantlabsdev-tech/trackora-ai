/**
 * Manual QA checklist (billing):
 * - Free → Elite: POST /api/billing/start-elite returns mode checkout + url; completing checkout creates one subscription.
 * - Pro → Elite: same route updates existing subscription item to STRIPE_ELITE_PRICE_ID with proration_behavior always_invoice; no second subscription id.
 * - Pro → Elite card decline: expect 402 PAYMENT_FAILED; profile stays Pro until Stripe shows paid invoice (webhook).
 * - Elite user: mode already_elite; no Stripe write.
 * - create-checkout-session with planTier elite: 400 (forces signed /api/billing/start-elite).
 */
import { getStartEliteUrl } from '../lib/apiBase'
import { supabase } from '../lib/supabase'

const ACCESS_REFRESH_MARGIN_SEC = 120

export type StartEliteSuccess =
  | { ok: true; mode: 'checkout'; url: string }
  | { ok: true; mode: 'subscription_updated' }
  | { ok: true; mode: 'already_elite'; message?: string }

export type StartEliteResult =
  | StartEliteSuccess
  | { ok: false; status: number; error: string; code?: string }

async function getAccessTokenForApi(): Promise<string | null> {
  if (!supabase) return null
  const { data: sessionData } = await supabase.auth.getSession()
  let session = sessionData?.session ?? null
  const now = Math.floor(Date.now() / 1000)
  const exp = session?.expires_at ?? 0
  const token = session?.access_token
  const needsRefresh = !token || !exp || exp <= now + ACCESS_REFRESH_MARGIN_SEC
  if (needsRefresh) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed.session?.access_token) return refreshed.session.access_token
  }
  return token ?? null
}

async function postStartEliteOnce(accessToken: string | null): Promise<Response> {
  return fetch(getStartEliteUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({}),
  })
}

function parseJson(data: unknown): Record<string, unknown> | null {
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>
  return null
}

/**
 * Server-enforced Elite path (no duplicate Pro+Elite subscriptions).
 */
export async function startEliteUpgrade(): Promise<StartEliteResult> {
  let accessToken = await getAccessTokenForApi()
  let res = await postStartEliteOnce(accessToken)
  if (res.status === 401 && supabase) {
    await supabase.auth.refreshSession()
    accessToken = await getAccessTokenForApi()
    if (accessToken) res = await postStartEliteOnce(accessToken)
  }

  let raw: unknown
  try {
    raw = await res.json()
  } catch {
    return { ok: false, status: res.status, error: 'Invalid response from server.' }
  }
  const data = parseJson(raw) ?? {}

  const err =
    typeof data.error === 'string' && data.error.trim() ? data.error.trim() : 'Request failed.'
  const code = typeof data.code === 'string' ? data.code : undefined

  if (!res.ok) {
    return { ok: false, status: res.status, error: err, code }
  }

  if (data.ok !== true) {
    return { ok: false, status: res.status, error: err }
  }

  const mode = typeof data.mode === 'string' ? data.mode : ''
  if (mode === 'checkout' && typeof data.url === 'string' && data.url.trim()) {
    return { ok: true, mode: 'checkout', url: data.url.trim() }
  }
  if (mode === 'subscription_updated') {
    return { ok: true, mode: 'subscription_updated' }
  }
  if (mode === 'already_elite') {
    const message = typeof data.message === 'string' ? data.message : undefined
    return { ok: true, mode: 'already_elite', message }
  }

  return { ok: false, status: 500, error: 'Unexpected response from billing server.' }
}
