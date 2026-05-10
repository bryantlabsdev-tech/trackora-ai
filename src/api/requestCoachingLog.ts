import type { CoachingLogApiPayload } from '../types/coaching'
import { getCoachingApiUrl } from '../lib/apiBase'
import { supabase } from '../lib/supabase'
import { sanitizeCoachingPayload } from '../../shared/sanitizeCoachingPayload.mjs'

/** User-facing copy when the API is unreachable or returns a server error. */
export const SERVER_UNAVAILABLE_MESSAGE =
  'TrackoraAI servers are temporarily unavailable. Please try again shortly.'

export type CoachingLogResult = {
  text: string
  /** openai = model; deterministic = server template; fallback = client offline */
  source: 'openai' | 'deterministic' | 'fallback'
  usage?: {
    usageCount: number
    remaining: number
    freeLimit: number
    isPro: boolean
  }
}

type ApiJson = {
  ok?: boolean
  text?: string
  source?: string
  usedOpenAI?: boolean
  useFallback?: boolean
  error?: string
  code?: string
  usageCount?: number
  remaining?: number
  freeLimit?: number
  isPro?: boolean
}

export class FreeLimitReachedError extends Error {
  constructor(message = 'Free limit reached') {
    super(message)
    this.name = 'FreeLimitReachedError'
  }
}

export class CoachingApiError extends Error {
  constructor(message = 'Could not generate coaching form') {
    super(message)
    this.name = 'CoachingApiError'
  }
}

/** Seconds before access_token expiry when we proactively refresh (JWT rejected by server after expiry). */
const ACCESS_REFRESH_MARGIN_SEC = 120

/**
 * Returns an access JWT valid for `supabaseAdmin.auth.getUser` on the API.
 * `getSession()` alone can return a stale cached token; calling `refreshSession()` fixes expired/near-expiry tokens.
 */
async function getAccessTokenForApi(): Promise<string | null> {
  if (!supabase) return null

  const { data: sessionData } = await supabase.auth.getSession()

  let session = sessionData?.session ?? null
  const now = Math.floor(Date.now() / 1000)
  const exp = session?.expires_at ?? 0
  const token = session?.access_token
  const needsRefresh =
    !token || !exp || exp <= now + ACCESS_REFRESH_MARGIN_SEC

  if (needsRefresh) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed.session?.access_token) {
      return refreshed.session.access_token
    }
  }

  return token ?? null
}

function mapSuccessToResult(data: ApiJson): CoachingLogResult | null {
  if (data?.ok === false) return null
  const text = typeof data?.text === 'string' ? data.text.trim() : ''
  if (!text) return null

  const rawSource = data.source
  const usedOpenAI = data.usedOpenAI

  let serverSource: 'openai' | 'deterministic'
  if (rawSource === 'openai') {
    if (typeof usedOpenAI === 'boolean' && !usedOpenAI) {
      if (import.meta.env.DEV) {
        console.warn(
          '[coaching API] server sent source "openai" but usedOpenAI false; labeling as deterministic',
        )
      }
      serverSource = 'deterministic'
    } else {
      serverSource = 'openai'
    }
  } else if (rawSource === 'deterministic') {
    serverSource = 'deterministic'
  } else {
    if (import.meta.env.DEV) {
      console.warn(
        '[coaching API] missing or unknown source; treating as deterministic (not OpenAI)',
        rawSource,
      )
    }
    serverSource = 'deterministic'
  }

  // JSON.stringify drops Infinity; Pro responses often omit a finite `remaining`.
  const freeLimit = Number(data.freeLimit)
  const usageCount = Number(data.usageCount)
  const isProFlag = data.isPro === true
  let usage: CoachingLogResult['usage'] = undefined
  if (typeof data.isPro === 'boolean' && Number.isFinite(freeLimit) && Number.isFinite(usageCount)) {
    if (isProFlag) {
      usage = {
        usageCount,
        remaining: Number.POSITIVE_INFINITY,
        freeLimit,
        isPro: true,
      }
    } else {
      const remaining = Number(data.remaining)
      if (Number.isFinite(remaining)) {
        usage = {
          usageCount,
          remaining: Math.max(0, remaining),
          freeLimit,
          isPro: false,
        }
      }
    }
  }
  return { text, source: serverSource, usage }
}

async function fetchCoachingLogOnce(
  clean: CoachingLogApiPayload,
  options?: { isTutorialRun?: boolean },
): Promise<CoachingLogResult | null> {
  const url = getCoachingApiUrl()
  const bodyPayload =
    options?.isTutorialRun === true ? { ...clean, isTutorialRun: true as const } : clean
  const payload = JSON.stringify({ action: 'coaching_log', payload: bodyPayload })

  const postOnce = async (accessToken: string | null) => {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: payload,
    })
  }

  let accessToken = await getAccessTokenForApi()

  let res: Response
  try {
    res = await postOnce(accessToken)
    if (res.status === 401 && supabase) {
      await supabase.auth.refreshSession()
      accessToken = await getAccessTokenForApi()
      if (accessToken) {
        res = await postOnce(accessToken)
      }
    }
  } catch (e) {
    console.error('[coaching API] network error')
    throw new CoachingApiError(SERVER_UNAVAILABLE_MESSAGE)
  }

  const contentType = res.headers.get('content-type') || ''
  let data: ApiJson

  try {
    if (contentType.includes('application/json')) {
      data = (await res.json()) as ApiJson
    } else {
      await res.text().catch(() => {})
      console.error('[coaching API] non-JSON response', res.status)
      throw new CoachingApiError(SERVER_UNAVAILABLE_MESSAGE)
    }
  } catch (e) {
    if (e instanceof CoachingApiError) throw e
    console.error('[coaching API] failed to parse response')
    throw new CoachingApiError(SERVER_UNAVAILABLE_MESSAGE)
  }

  if (!res.ok) {
    if (res.status === 403 && data?.code === 'FREE_LIMIT_REACHED') {
      throw new FreeLimitReachedError(data?.error || 'Free limit reached')
    }
    if (res.status === 429 || data?.code === 'RATE_LIMIT') {
      throw new CoachingApiError(
        typeof data?.error === 'string' && data.error.trim()
          ? data.error
          : 'Too many requests. Please try again in a few minutes.',
      )
    }
    if (res.status === 401) {
      throw new CoachingApiError(data?.error || 'Session expired. Please sign in again.')
    }
    if (res.status >= 500) {
      throw new CoachingApiError(SERVER_UNAVAILABLE_MESSAGE)
    }
    throw new CoachingApiError(
      typeof data?.error === 'string' && data.error.trim()
        ? data.error
        : 'Could not generate coaching form. Please try again.',
    )
  }

  const mapped = mapSuccessToResult(data)
  if (!mapped) {
    console.error('[coaching API] unusable success body')
    throw new CoachingApiError(SERVER_UNAVAILABLE_MESSAGE)
  }

  return mapped
}

export async function requestCoachingLog(
  payload: CoachingLogApiPayload,
  options?: { isTutorialRun?: boolean },
): Promise<CoachingLogResult> {
  const clean = sanitizeCoachingPayload(payload)

  let result: CoachingLogResult | null = null
  try {
    result = await fetchCoachingLogOnce(clean, options)
  } catch (err) {
    if (err instanceof FreeLimitReachedError || err instanceof CoachingApiError) throw err
    console.error('[coaching API] unexpected error')
  }
  if (result) return result

  try {
    result = await fetchCoachingLogOnce(clean, options)
  } catch (err) {
    if (err instanceof FreeLimitReachedError || err instanceof CoachingApiError) throw err
    console.error('[coaching API] retry unexpected error')
  }
  if (result) return result

  throw new CoachingApiError(SERVER_UNAVAILABLE_MESSAGE)
}
