import { getCoachingRecordsUrl } from '../lib/apiBase'
import { supabase } from '../lib/supabase'
import type { CoachingRecord, CoachingRecordStatus } from '../types/coachingRecord'

async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data: sessionData } = await supabase.auth.getSession()
  let token = sessionData?.session?.access_token ?? null
  if (!token) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    token = refreshed.session?.access_token ?? null
  }
  return token
}

export async function listCoachingRecords(
  limit = 30,
): Promise<{ ok: true; records: CoachingRecord[] } | { ok: false; error: string }> {
  const token = await getAccessToken()
  if (!token) return { ok: false, error: 'No active session.' }

  try {
    const url = `${getCoachingRecordsUrl()}?limit=${encodeURIComponent(String(limit))}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; records?: CoachingRecord[]; error?: string }
      | null
    if (!res.ok || !json?.ok || !Array.isArray(json.records)) {
      return { ok: false, error: json?.error || 'Could not load coaching history.' }
    }
    return { ok: true, records: json.records }
  } catch {
    return { ok: false, error: 'Could not load coaching history.' }
  }
}

export async function updateCoachingRecord(
  recordId: string,
  updates: {
    status?: CoachingRecordStatus
    followUpDueAt?: string | null
    markFollowUpCompleted?: boolean
  },
): Promise<{ ok: true; record: CoachingRecord } | { ok: false; error: string }> {
  const token = await getAccessToken()
  if (!token) return { ok: false, error: 'No active session.' }

  try {
    const res = await fetch(`${getCoachingRecordsUrl()}/${encodeURIComponent(recordId)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    })
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; record?: CoachingRecord; error?: string }
      | null
    if (!res.ok || !json?.ok || !json.record) {
      return { ok: false, error: json?.error || 'Could not update coaching record.' }
    }
    return { ok: true, record: json.record }
  } catch {
    return { ok: false, error: 'Could not update coaching record.' }
  }
}

