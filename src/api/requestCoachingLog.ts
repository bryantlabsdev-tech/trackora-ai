import type { CoachingLogApiPayload } from '../types/coaching'
import { getCoachingApiUrl } from '../lib/apiBase'
import { sanitizeCoachingPayload } from '../../shared/sanitizeCoachingPayload.mjs'

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

function mapSuccessToResult(data: ApiJson): CoachingLogResult | null {
  if (data?.ok === false) return null
  const text = typeof data?.text === 'string' ? data.text.trim() : ''
  if (!text) return null

  const rawSource = data.source
  const usedOpenAI = data.usedOpenAI

  let serverSource: 'openai' | 'deterministic'
  if (rawSource === 'openai') {
    if (typeof usedOpenAI === 'boolean' && !usedOpenAI) {
      console.warn(
        '[coaching API] server sent source "openai" but usedOpenAI false; labeling as deterministic',
      )
      serverSource = 'deterministic'
    } else {
      serverSource = 'openai'
    }
  } else if (rawSource === 'deterministic') {
    serverSource = 'deterministic'
  } else {
    console.warn(
      '[coaching API] missing or unknown source; treating as deterministic (not OpenAI)',
      rawSource,
    )
    serverSource = 'deterministic'
  }

  const openaiActuallyUsed = serverSource === 'openai'
  console.log('[coaching API] resolved labeling', {
    bodyOk: data.ok === true || data.ok === undefined,
    sourceRaw: rawSource,
    sourceResolved: serverSource,
    usedOpenAIField: usedOpenAI,
    openaiActuallyUsed,
  })

  const usage =
    Number.isFinite(data.usageCount) &&
    Number.isFinite(data.remaining) &&
    Number.isFinite(data.freeLimit) &&
    typeof data.isPro === 'boolean'
      ? {
          usageCount: Number(data.usageCount),
          remaining: Number(data.remaining),
          freeLimit: Number(data.freeLimit),
          isPro: data.isPro,
        }
      : undefined
  return { text, source: serverSource, usage }
}

async function fetchCoachingLogOnce(
  clean: CoachingLogApiPayload,
  options?: { isTutorialRun?: boolean; accessToken?: string | null },
): Promise<CoachingLogResult | null> {
  const url = getCoachingApiUrl()
  const bodyPayload =
    options?.isTutorialRun === true ? { ...clean, isTutorialRun: true as const } : clean
  const payload = JSON.stringify({ action: 'coaching_log', payload: bodyPayload })

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      },
      body: payload,
    })
  } catch (e) {
    console.error('[coaching API] fetch failed', e)
    return null
  }

  const contentType = res.headers.get('content-type') || ''
  let data: ApiJson

  try {
    if (contentType.includes('application/json')) {
      data = (await res.json()) as ApiJson
    } else {
      const text = await res.text()
      console.error('[coaching API] expected JSON, got', contentType, res.status, text.slice(0, 400))
      return null
    }
  } catch (e) {
    console.error('[coaching API] failed to parse response', e)
    return null
  }

  console.log('[coaching API] response', {
    url,
    httpOk: res.ok,
    httpStatus: res.status,
    bodyOk: data?.ok,
    source: data?.source,
    usedOpenAI: data?.usedOpenAI,
    hasText: typeof data?.text === 'string' && Boolean(data.text?.trim()),
    error: data?.error,
  })

  if (!res.ok) {
    if (res.status === 403 && data?.code === 'FREE_LIMIT_REACHED') {
      throw new FreeLimitReachedError(data?.error || 'Free limit reached')
    }
    throw new CoachingApiError(data?.error || `HTTP ${res.status}`)
  }

  const mapped = mapSuccessToResult(data)
  if (!mapped) {
    console.error('[coaching API] unusable body (missing ok/text)', data)
    return null
  }

  return mapped
}

export async function requestCoachingLog(
  payload: CoachingLogApiPayload,
  options?: { isTutorialRun?: boolean; accessToken?: string | null },
): Promise<CoachingLogResult> {
  const clean = sanitizeCoachingPayload(payload)

  let result: CoachingLogResult | null = null
  try {
    result = await fetchCoachingLogOnce(clean, options)
  } catch (err) {
    if (err instanceof FreeLimitReachedError || err instanceof CoachingApiError) throw err
    console.error('[coaching API] unexpected error', err)
  }
  if (result) return result

  console.warn('[coaching API] retrying once after failure')
  try {
    result = await fetchCoachingLogOnce(clean, options)
  } catch (err) {
    if (err instanceof FreeLimitReachedError || err instanceof CoachingApiError) throw err
    console.error('[coaching API] retry unexpected error', err)
  }
  if (result) return result

  throw new CoachingApiError('Could not generate coaching form. Please try again.')
}
