import type { CoachingLogApiPayload } from '../types/coaching'
import { getCoachingApiUrl } from '../lib/apiBase'
import { getCoachingLogFallback } from '../lib/coachingLogFallback'
import { sanitizeCoachingPayload } from '../../shared/sanitizeCoachingPayload.mjs'

export type CoachingLogResult = {
  text: string
  /** openai = model; deterministic = server template; fallback = client offline */
  source: 'openai' | 'deterministic' | 'fallback'
}

type ApiJson = {
  ok?: boolean
  text?: string
  source?: string
  usedOpenAI?: boolean
  useFallback?: boolean
  error?: string
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

  return { text, source: serverSource }
}

async function fetchCoachingLogOnce(
  clean: CoachingLogApiPayload,
): Promise<CoachingLogResult | null> {
  const url = getCoachingApiUrl()
  const payload = JSON.stringify({ action: 'coaching_log', payload: clean })

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    console.error('[coaching API] HTTP error', res.status, data)
    return null
  }

  const mapped = mapSuccessToResult(data)
  if (!mapped) {
    console.error('[coaching API] unusable body (missing ok/text)', data)
    return null
  }

  return mapped
}

export async function requestCoachingLog(payload: CoachingLogApiPayload): Promise<CoachingLogResult> {
  const clean = sanitizeCoachingPayload(payload)

  let result = await fetchCoachingLogOnce(clean)
  if (result) return result

  console.warn('[coaching API] retrying once after failure')
  result = await fetchCoachingLogOnce(clean)
  if (result) return result

  console.error('[coaching API] all attempts failed; using client fallback (not OpenAI)')
  return { text: getCoachingLogFallback(clean), source: 'fallback' }
}
