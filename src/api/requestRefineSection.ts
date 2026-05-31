import type { RefineSectionApiPayload } from '../types/coaching'
import { getCoachingApiUrl } from '../lib/apiBase'
import { supabase } from '../lib/supabase'
import { CoachingApiError, FreeLimitReachedError, SERVER_UNAVAILABLE_MESSAGE } from './requestCoachingLog'

/** Seconds before access_token expiry when we proactively refresh (same as coaching generation). */
const ACCESS_REFRESH_MARGIN_SEC = 120

export class RefinementRequiresProError extends Error {
  constructor(message = 'Section refinements require Pro.') {
    super(message)
    this.name = 'RefinementRequiresProError'
  }
}

export class RefinementMonthlyLimitError extends Error {
  constructor(message = "You've reached your monthly refinement limit.") {
    super(message)
    this.name = 'RefinementMonthlyLimitError'
  }
}

export type RefineSectionResult = {
  refinedText: string
  source: 'openai'
  usage?: {
    usageCount: number
    remaining: number
    freeLimit: number
    isPro: boolean
  }
  /** Align local profile with server after a successful refine. */
  refinementSnapshot?: {
    refinement_count: number
    refinement_month: string | null
  }
}

type ApiJson = {
  ok?: boolean
  refinedText?: string
  refinedSectionText?: string
  source?: string
  usedOpenAI?: boolean
  error?: string
  code?: string
  usageCount?: number
  remaining?: number
  freeLimit?: number
  isPro?: boolean
  refinementUsedThisMonth?: number
  refinementLimit?: number
  refinementRemaining?: number | null
  refinementUnlimited?: boolean
  refinementMonth?: string
}

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
    if (refreshed.session?.access_token) {
      return refreshed.session.access_token
    }
  }

  return token ?? null
}

function mapSuccessToResult(data: ApiJson): RefineSectionResult | null {
  if (data?.ok === false) return null
  const refined =
    typeof data?.refinedText === 'string'
      ? data.refinedText.trim()
      : typeof data?.refinedSectionText === 'string'
        ? data.refinedSectionText.trim()
        : ''
  if (!refined) return null

  const freeLimit = Number(data.freeLimit)
  const usageCount = Number(data.usageCount)
  const isProFlag = data.isPro === true
  let usage: RefineSectionResult['usage'] = undefined
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

  let refinementSnapshot: RefineSectionResult['refinementSnapshot']
  if (typeof data.refinementUsedThisMonth === 'number' && Number.isFinite(data.refinementUsedThisMonth)) {
    refinementSnapshot = {
      refinement_count: Math.max(0, Math.floor(data.refinementUsedThisMonth)),
      refinement_month:
        typeof data.refinementMonth === 'string' && data.refinementMonth.trim()
          ? data.refinementMonth.trim()
          : null,
    }
    console.log('[refinement] client received snapshot', {
      refinement_count: refinementSnapshot.refinement_count,
      refinement_month: refinementSnapshot.refinement_month,
      refinementUnlimited: data.refinementUnlimited === true,
    })
  }

  return { refinedText: refined, source: 'openai', usage, refinementSnapshot }
}

async function fetchRefineOnce(clean: RefineSectionApiPayload): Promise<RefineSectionResult | null> {
  const url = getCoachingApiUrl()
  const payload = JSON.stringify({ action: 'refine_section', payload: clean })

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
  } catch {
    console.error('[refine API] network error')
    throw new CoachingApiError(SERVER_UNAVAILABLE_MESSAGE)
  }

  const contentType = res.headers.get('content-type') || ''
  let data: ApiJson

  try {
    if (contentType.includes('application/json')) {
      data = (await res.json()) as ApiJson
    } else {
      await res.text().catch(() => {})
      console.error('[refine API] non-JSON response', res.status)
      throw new CoachingApiError(SERVER_UNAVAILABLE_MESSAGE)
    }
  } catch (e) {
    if (e instanceof CoachingApiError) throw e
    console.error('[refine API] failed to parse response')
    throw new CoachingApiError(SERVER_UNAVAILABLE_MESSAGE)
  }

  const serverMessage =
    typeof data?.error === 'string' && data.error.trim() ? data.error.trim() : null

  if (!res.ok) {
    if (res.status === 403 && data?.code === 'REFINEMENT_REQUIRES_PRO') {
      throw new RefinementRequiresProError(serverMessage || 'Section refinements require Pro.')
    }
    if (res.status === 403 && data?.code === 'REFINEMENT_MONTHLY_LIMIT_REACHED') {
      throw new RefinementMonthlyLimitError(
        serverMessage || "You've reached your monthly refinement limit.",
      )
    }
    if (res.status === 403 && data?.code === 'FREE_LIMIT_REACHED') {
      throw new FreeLimitReachedError(serverMessage || 'Free limit reached')
    }
    if (res.status === 429 || data?.code === 'RATE_LIMIT') {
      throw new CoachingApiError(
        serverMessage || 'Too many requests. Please try again in a few minutes.',
      )
    }
    if (res.status === 401) {
      throw new CoachingApiError(serverMessage || 'Session expired. Please sign in again.')
    }
    if (res.status >= 500) {
      throw new CoachingApiError(serverMessage || SERVER_UNAVAILABLE_MESSAGE)
    }
    throw new CoachingApiError(serverMessage || 'Could not refine this section. Please try again.')
  }

  const mapped = mapSuccessToResult(data)
  if (!mapped) {
    console.error('[refine API] unusable success body', data)
    throw new CoachingApiError(serverMessage || SERVER_UNAVAILABLE_MESSAGE)
  }

  return mapped
}

export async function requestRefineSection(payload: RefineSectionApiPayload): Promise<RefineSectionResult> {
  let result: RefineSectionResult | null = null
  try {
    result = await fetchRefineOnce(payload)
  } catch (err) {
    if (
      err instanceof FreeLimitReachedError ||
      err instanceof RefinementRequiresProError ||
      err instanceof RefinementMonthlyLimitError ||
      err instanceof CoachingApiError
    )
      throw err
    console.error('[refine API] unexpected error')
  }
  if (result) return result

  try {
    result = await fetchRefineOnce(payload)
  } catch (err) {
    if (
      err instanceof FreeLimitReachedError ||
      err instanceof RefinementRequiresProError ||
      err instanceof RefinementMonthlyLimitError ||
      err instanceof CoachingApiError
    )
      throw err
    console.error('[refine API] retry unexpected error')
  }
  if (result) return result

  throw new CoachingApiError(SERVER_UNAVAILABLE_MESSAGE)
}
