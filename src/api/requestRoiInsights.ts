import { getRoiInsightsUrl } from '../lib/apiBase'
import { supabase } from '../lib/supabase'

export type RoiInsights = {
  formsGenerated: number
  coachingCompletionRate: number | null
  repsNeedingFollowUp: number
  mostCoachedMetric: string | null
  apsTrend: Array<{ at: string; value: number }>
  hpaTrend: Array<{ at: string; value: number }>
  mptTrend: Array<{ at: string; value: number }>
  beforeAfter: {
    aps: { before: number; latest: number; delta: number } | null
    hpa: { before: number; latest: number; delta: number } | null
    mpt: { before: number; latest: number; delta: number } | null
  }
}

export async function requestRoiInsights(): Promise<{ ok: true; data: RoiInsights; hasData: boolean } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Auth client unavailable.' }
  const { data: sessionData } = await supabase.auth.getSession()
  let token = sessionData?.session?.access_token ?? null
  if (!token) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    token = refreshed.session?.access_token ?? null
  }
  if (!token) return { ok: false, error: 'No active session.' }

  try {
    const res = await fetch(getRoiInsightsUrl(), {
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; insights?: RoiInsights; hasData?: boolean; error?: string }
      | null
    if (!res.ok || !json?.ok || !json?.insights) {
      return { ok: false, error: json?.error || 'Could not load ROI insights.' }
    }
    return { ok: true, data: json.insights, hasData: Boolean(json.hasData) }
  } catch {
    return { ok: false, error: 'Could not load ROI insights.' }
  }
}

