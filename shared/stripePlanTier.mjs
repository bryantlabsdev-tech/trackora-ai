/**
 * Read Stripe subscription line items to infer Pro vs Elite from price IDs.
 * Elite is only assigned when STRIPE_ELITE_PRICE_ID matches a subscription item price.
 */

/**
 * @param {Record<string, unknown>} subscription – Stripe Subscription object
 * @returns {string[]}
 */
export function collectSubscriptionPriceIds(subscription) {
  const items = subscription?.items?.data
  if (!Array.isArray(items)) return []
  const ids = []
  for (const it of items) {
    const p = it?.price
    const id = typeof p === 'string' ? p : p && typeof p.id === 'string' ? p.id : ''
    const t = id.trim()
    if (t) ids.push(t)
  }
  return ids
}

/**
 * @param {Record<string, unknown>} subscription – Stripe Subscription object
 * @param {unknown} elitePriceId – env STRIPE_ELITE_PRICE_ID
 * @returns {'pro' | 'elite'}
 */
export function inferBillingPlanTierFromSubscription(subscription, elitePriceId) {
  const elite = String(elitePriceId ?? '').trim()
  if (!elite) return 'pro'
  const ids = collectSubscriptionPriceIds(subscription)
  return ids.includes(elite) ? 'elite' : 'pro'
}
