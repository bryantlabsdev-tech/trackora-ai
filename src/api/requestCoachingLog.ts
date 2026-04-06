import type { CoachingLogApiPayload } from '../types/coaching'
import { getCoachingApiUrl } from '../lib/apiBase'
import { getCoachingLogFallback } from '../lib/coachingLogFallback'
import { sanitizeCoachingPayload } from '../../shared/sanitizeCoachingPayload.mjs'

export type CoachingLogResult = {
  text: string
  source: 'openai' | 'fallback'
}

export async function requestCoachingLog(payload: CoachingLogApiPayload): Promise<CoachingLogResult> {
  const clean = sanitizeCoachingPayload(payload)

  try {
    const res = await fetch(getCoachingApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'coaching_log', payload: clean }),
    })

    const data = (await res.json()) as {
      ok?: boolean
      text?: string
      useFallback?: boolean
      error?: string
    }

    if (data?.ok && typeof data.text === 'string' && data.text.trim()) {
      return { text: data.text.trim(), source: 'openai' }
    }
  } catch {
    // network
  }

  return { text: getCoachingLogFallback(clean), source: 'fallback' }
}
