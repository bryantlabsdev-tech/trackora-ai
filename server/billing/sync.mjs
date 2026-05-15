import { evaluateSubscriptionAccess } from '../../shared/billingSubscription.mjs'
import { inferBillingPlanTierFromSubscription } from '../../shared/stripePlanTier.mjs'
import {
  stripe,
  supabaseAdmin,
  stripeElitePriceId,
  billingReconcileCooldown,
  BILLING_RECONCILE_COOLDOWN_MS,
} from '../config.mjs'

export function pickStripeId(value) {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value && 'id' in value && typeof value.id === 'string') {
    return value.id
  }
  return null
}

/**
 * @param {string} customerId
 * @param {string | null} subscriptionId
 * @param {string | null} metadataUserId
 * @returns {Promise<string | null>}
 */
export async function resolveProfileIdForBilling(customerId, subscriptionId, metadataUserId) {
  const candidateId = typeof metadataUserId === 'string' ? metadataUserId.trim() : ''
  if (candidateId) return candidateId
  if (!supabaseAdmin) return null

  if (subscriptionId) {
    const { data: bySub, error: bySubError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle()
    if (bySubError) {
      console.error('[billing-sync] profile lookup by subscription failed:', bySubError.message)
    } else if (bySub?.id) {
      return String(bySub.id)
    }
  }

  const { data: byCustomer, error: byCustomerError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  if (byCustomerError) {
    console.error('[billing-sync] profile lookup by customer failed:', byCustomerError.message)
    return null
  }
  return byCustomer?.id ? String(byCustomer.id) : null
}

/**
 * @param {{
 *   eventType: string
 *   customerId: string
 *   subscription: Stripe.Subscription
 *   metadataUserId: string | null
 * }} params
 */
export async function syncSubscriptionToUser(params) {
  const { eventType, customerId, subscription, metadataUserId } = params
  const subscriptionId = pickStripeId(subscription.id)
  const profileId = await resolveProfileIdForBilling(customerId, subscriptionId, metadataUserId)
  const access = evaluateSubscriptionAccess(subscription)

  console.log('[billing-sync] event:', eventType)
  console.log('[billing-sync] customer id:', customerId)
  console.log('[billing-sync] subscription id:', subscriptionId ?? '(none)')
  console.log('[billing-sync] profile id:', profileId ?? '(unresolved)')
  console.log('[billing-sync] decision:', {
    is_pro: access.isPro,
    reason: access.reason,
    subscription_status: access.subscriptionStatus,
    current_period_end: access.currentPeriodEndIso,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
  })

  if (!supabaseAdmin) {
    console.error('[billing-sync] Supabase admin is not configured')
    return { ok: false, skipped: 'no_supabase_admin' }
  }
  if (!profileId) {
    console.error('[billing-sync] Could not resolve profile id for billing event')
    return { ok: false, skipped: 'profile_not_found' }
  }

  const planTier = access.isPro ? inferBillingPlanTierFromSubscription(subscription, stripeElitePriceId) : 'free'
  const updatePayload = {
    is_pro: access.isPro,
    plan_tier: planTier,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    subscription_status: access.subscriptionStatus,
    current_period_end: access.currentPeriodEndIso,
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(updatePayload)
    .eq('id', profileId)
    .select('id')

  if (error) {
    console.error('[billing-sync] Supabase update FAILED', {
      eventType,
      profileId,
      message: error.message,
      code: error.code ?? null,
    })
    return { ok: false, skipped: 'supabase_error', error: error.message }
  }
  if (!data?.length) {
    console.error('[billing-sync] Supabase update matched NO ROWS', { eventType, profileId })
    return { ok: false, skipped: 'no_row_updated' }
  }

  console.log('[billing-sync] Supabase OK — subscription state synced', {
    eventType,
    profileId,
    is_pro: updatePayload.is_pro,
    plan_tier: updatePayload.plan_tier,
    subscription_status: updatePayload.subscription_status,
    current_period_end: updatePayload.current_period_end,
  })
  return { ok: true, profileId, updatePayload }
}

/**
 * Pull latest subscription from Stripe and sync to profiles (backup if webhooks lag).
 * @param {string} userId
 * @param {{ force?: boolean }} [opts]
 */
export async function reconcileStripeSubscriptionForUser(userId, opts = {}) {
  if (!stripe || !supabaseAdmin) {
    return { ok: false, skipped: 'not_configured' }
  }
  const now = Date.now()
  if (!opts.force) {
    const last = billingReconcileCooldown.get(userId) ?? 0
    if (now - last < BILLING_RECONCILE_COOLDOWN_MS) {
      console.log('[billing-reconcile] cooldown active, skipping Stripe call for user', userId)
      return { ok: true, skipped: 'cooldown' }
    }
  }
  billingReconcileCooldown.set(userId, now)

  const { data: row, error } = await supabaseAdmin
    .from('profiles')
    .select('stripe_subscription_id, stripe_customer_id')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('[billing-reconcile] profile load failed:', error.message)
    return { ok: false, skipped: 'profile_load_error', error: error.message }
  }
  if (!row) {
    console.warn('[billing-reconcile] no profile row', userId)
    return { ok: false, skipped: 'no_profile' }
  }

  let subscriptionId =
    row.stripe_subscription_id && typeof row.stripe_subscription_id === 'string'
      ? row.stripe_subscription_id.trim()
      : ''
  const customerIdRaw =
    row.stripe_customer_id && typeof row.stripe_customer_id === 'string' ? row.stripe_customer_id.trim() : ''

  if (!subscriptionId && customerIdRaw) {
    try {
      const list = await stripe.subscriptions.list({
        customer: customerIdRaw,
        status: 'all',
        limit: 10,
      })
      const prefer = ['active', 'trialing', 'past_due', 'unpaid', 'canceled', 'incomplete']
      for (const st of prefer) {
        const hit = list.data.find((s) => s.status === st)
        if (hit?.id) {
          subscriptionId = hit.id
          break
        }
      }
    } catch (e) {
      const msg = typeof e?.message === 'string' ? e.message : 'list failed'
      console.error('[billing-reconcile] subscription list failed:', msg)
      return { ok: false, skipped: 'stripe_list_error', error: msg }
    }
  }

  if (!subscriptionId) {
    console.log('[billing-reconcile] no subscription to reconcile', userId)
    return { ok: true, skipped: 'no_stripe_subscription' }
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const customerId = pickStripeId(subscription.customer) || customerIdRaw
    if (!customerId) {
      console.error('[billing-reconcile] missing customer on subscription', subscriptionId)
      return { ok: false, skipped: 'missing_customer' }
    }
    console.log('[billing-reconcile] syncing from Stripe API', { userId, subscriptionId })
    return syncSubscriptionToUser({
      eventType: 'billing.reconcile',
      customerId,
      subscription,
      metadataUserId: userId,
    })
  } catch (e) {
    const msg = typeof e?.message === 'string' ? e.message : 'retrieve failed'
    console.error('[billing-reconcile] Stripe retrieve failed:', { userId, subscriptionId, message: msg })
    return { ok: false, skipped: 'stripe_retrieve_error', error: msg }
  }
}

/**
 * @param {import('express').Response} res
 * @param {string} eventType
 * @param {Awaited<ReturnType<typeof syncSubscriptionToUser>>} result
 */
export function respondStripeWebhookSync(res, eventType, result) {
  if (!result.ok && result.skipped === 'profile_not_found') {
    console.warn('[webhook/stripe] sync skipped (profile not found) — may be race before checkout metadata', {
      eventType,
    })
    return res.status(200).json({ received: true, result })
  }
  if (!result.ok && (result.skipped === 'no_supabase_admin' || result.skipped === 'not_configured')) {
    console.error('[webhook/stripe] sync failed — server misconfiguration', { eventType, result })
    return res.status(503).json({ received: false, result })
  }
  if (!result.ok) {
    console.error('[webhook/stripe] sync FAILED — returning 500 so Stripe retries', { eventType, result })
    return res.status(500).json({ received: false, result })
  }
  console.log('[webhook/stripe] sync success', { eventType, profileId: result.profileId })
  return res.status(200).json({ received: true, result })
}

