import { evaluateSubscriptionAccess } from './billingSubscription.mjs'
import { inferBillingPlanTierFromSubscription } from './stripePlanTier.mjs'

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function pickStripeId(value) {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value && 'id' in value && typeof value.id === 'string') {
    return value.id
  }
  return null
}

/**
 * One-time / admin: re-fetch each profile’s Stripe subscription and align `profiles` with `evaluateSubscriptionAccess`.
 *
 * @param {import('stripe').default} stripe
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {{ dryRun?: boolean; elitePriceId?: string; onProgress?: (e: Record<string, unknown>) => void }} [opts]
 * @returns {Promise<{ processed: number; updated: number; skipped: number; errors: number }>}
 */
export async function resyncAllProfilesFromStripe(stripe, supabaseAdmin, opts = {}) {
  const dryRun = opts.dryRun === true
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {}
  const elitePriceId =
    typeof opts.elitePriceId === 'string' && opts.elitePriceId.trim()
      ? opts.elitePriceId.trim()
      : typeof process.env.STRIPE_ELITE_PRICE_ID === 'string'
        ? process.env.STRIPE_ELITE_PRICE_ID.trim()
        : ''

  const { data: rows, error } = await supabaseAdmin
    .from('profiles')
    .select('id, stripe_subscription_id, stripe_customer_id, is_pro, subscription_status, plan_tier')
    .or('stripe_subscription_id.not.is.null,stripe_customer_id.not.is.null')

  if (error) {
    throw new Error(`profiles select failed: ${error.message}`)
  }

  const list = rows ?? []
  let updated = 0
  let skipped = 0
  let errors = 0

  for (const row of list) {
    const userId = String(row.id)
    let subscriptionId =
      row.stripe_subscription_id && typeof row.stripe_subscription_id === 'string'
        ? row.stripe_subscription_id.trim()
        : ''
    const customerIdRaw =
      row.stripe_customer_id && typeof row.stripe_customer_id === 'string'
        ? row.stripe_customer_id.trim()
        : ''

    try {
      if (!subscriptionId && customerIdRaw) {
        const subs = await stripe.subscriptions.list({
          customer: customerIdRaw,
          status: 'all',
          limit: 10,
        })
        const prefer = ['active', 'trialing', 'past_due', 'unpaid', 'canceled', 'incomplete']
        for (const st of prefer) {
          const hit = subs.data.find((s) => s.status === st)
          if (hit?.id) {
            subscriptionId = hit.id
            break
          }
        }
      }

      if (!subscriptionId) {
        skipped += 1
        onProgress({ userId, skipped: 'no_stripe_subscription' })
        continue
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const access = evaluateSubscriptionAccess(subscription)
      const customerId = pickStripeId(subscription.customer) || customerIdRaw
      const subId = pickStripeId(subscription.id) || subscriptionId

      const planTier = access.isPro ? inferBillingPlanTierFromSubscription(subscription, elitePriceId) : 'free'
      const updatePayload = {
        is_pro: access.isPro,
        plan_tier: planTier,
        stripe_customer_id: customerId,
        stripe_subscription_id: subId,
        subscription_status: access.subscriptionStatus,
        current_period_end: access.currentPeriodEndIso,
      }

      const changed =
        row.is_pro !== updatePayload.is_pro ||
        (row.subscription_status ?? null) !== (updatePayload.subscription_status ?? null) ||
        String(row.plan_tier ?? 'free') !== String(updatePayload.plan_tier)

      if (!changed) {
        skipped += 1
        onProgress({ userId, skipped: 'already_in_sync' })
        continue
      }

      if (dryRun) {
        onProgress({ userId, dryRun: true, wouldUpdate: updatePayload })
        updated += 1
        continue
      }

      const { data: upd, error: upErr } = await supabaseAdmin
        .from('profiles')
        .update(updatePayload)
        .eq('id', userId)
        .select('id')

      if (upErr) {
        errors += 1
        onProgress({ userId, error: upErr.message })
        continue
      }
      if (!upd?.length) {
        errors += 1
        onProgress({ userId, error: 'no_row_updated' })
        continue
      }

      updated += 1
      onProgress({
        userId,
        updated: true,
        subscription_status: updatePayload.subscription_status,
        is_pro: updatePayload.is_pro,
        plan_tier: updatePayload.plan_tier,
      })
    } catch (e) {
      errors += 1
      const msg = typeof e?.message === 'string' ? e.message : 'unknown'
      onProgress({ userId, error: msg })
    }
  }

  return { processed: list.length, updated, skipped, errors }
}
