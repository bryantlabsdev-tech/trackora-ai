import type { SupabaseClient } from '@supabase/supabase-js'
import { getBillingReconcileUrl } from './apiBase'
import { parseCoachingWorkspace } from '../../shared/coachingWorkspace.mjs'
import type { CoachingWorkspace, Profile, ProfileRow } from '../types/profile'

function mapRow(row: ProfileRow): Profile {
  return { ...row }
}

const PROFILE_COLUMNS =
  'id, email, is_pro, plan_tier, usage_count, bonus_ai_generations, refinement_count, refinement_month, has_seen_tutorial, has_seen_paywall, tutorial_welcome_bonus_granted, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end, created_at, coaching_workspace, needs_coaching_workspace_setup'

export async function fetchProfile(client: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await client.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle()

  if (error) {
    console.error('[profiles] fetch', error.message)
    return null
  }
  if (!data) return null
  const raw = data as ProfileRow & {
    has_seen_tutorial?: boolean
    has_seen_paywall?: boolean
    bonus_ai_generations?: number
    plan_tier?: string
  }
  const pt = String(raw.plan_tier ?? 'free').trim().toLowerCase()
  const plan_tier: ProfileRow['plan_tier'] =
    pt === 'elite' ? 'elite' : pt === 'pro' ? 'pro' : 'free'
  const coaching_workspace: CoachingWorkspace = parseCoachingWorkspace(
    (raw as { coaching_workspace?: string }).coaching_workspace,
  )
  const needs_coaching_workspace_setup = (raw as { needs_coaching_workspace_setup?: boolean })
    .needs_coaching_workspace_setup === true
  return mapRow({
    ...raw,
    plan_tier,
    coaching_workspace,
    needs_coaching_workspace_setup,
    has_seen_tutorial: raw.has_seen_tutorial === true,
    has_seen_paywall: raw.has_seen_paywall === true,
    bonus_ai_generations: Math.max(0, Math.floor(Number(raw.bonus_ai_generations) || 0)),
    refinement_count: Math.max(0, Math.floor(Number(raw.refinement_count ?? 0) || 0)),
    refinement_month:
      typeof raw.refinement_month === 'string' && raw.refinement_month.trim()
        ? raw.refinement_month.trim()
        : raw.refinement_month ?? null,
  })
}

/**
 * Ensures a profile row exists (first login or before trigger exists).
 * Does not overwrite existing rows.
 */
export async function ensureProfileRow(
  client: SupabaseClient,
  userId: string,
  email: string | null,
): Promise<Profile | null> {
  const existing = await fetchProfile(client, userId)
  if (existing) return existing

  const { error: insertError } = await client.from('profiles').insert({
    id: userId,
    email: email?.trim() ?? '',
  })

  if (insertError && insertError.code !== '23505') {
    console.error('[profiles] insert', insertError.message)
    return null
  }

  return fetchProfile(client, userId)
}

/**
 * Re-sync subscription from Stripe into `profiles` (backup if webhooks delayed). No-op without session.
 */
export async function reconcileStripeSubscription(client: SupabaseClient): Promise<void> {
  try {
    const { data: sessionData } = await client.auth.getSession()
    const token = sessionData?.session?.access_token
    if (!token) return

    const res = await fetch(getBillingReconcileUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn('[profiles] billing reconcile HTTP', res.status, text.slice(0, 200))
      return
    }

    const json = await res.json().catch(() => null)
    if (import.meta.env.DEV && json && typeof json === 'object' && 'skipped' in json) {
      console.log('[profiles] billing reconcile:', json)
    }
  } catch (e) {
    console.warn('[profiles] billing reconcile failed', e)
  }
}

/** Call after a successful OpenAI-backed generation; RPC no-ops for Pro users. */
export async function incrementAiUsage(client: SupabaseClient): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client.rpc('increment_ai_usage')
  if (error) {
    console.error('[profiles] increment_ai_usage', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function markTutorialSeen(client: SupabaseClient): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client.rpc('mark_tutorial_seen')
  if (error) {
    console.error('[profiles] mark_tutorial_seen', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function resetTutorialForReplay(
  client: SupabaseClient,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client.rpc('reset_tutorial_for_replay')
  if (error) {
    console.error('[profiles] reset_tutorial_for_replay', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function markPaywallSeen(client: SupabaseClient): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client.rpc('mark_paywall_seen')
  if (error) {
    console.error('[profiles] mark_paywall_seen', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function persistCoachingWorkspace(
  client: SupabaseClient,
  workspace: CoachingWorkspace,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client.rpc('set_coaching_workspace', { p_workspace: workspace })
  if (error) {
    console.error('[profiles] set_coaching_workspace', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
