/**
 * Pro → Elite in-place Stripe subscription upgrade (same subscription id, proration invoice).
 */

/**
 * Dedupe non-empty price id strings.
 * @param {readonly string[]} ids
 * @returns {string[]}
 */
export function dedupePriceIds(ids) {
  const out = []
  const seen = new Set()
  for (const raw of ids) {
    const s = String(raw ?? '').trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

/**
 * Pick the subscription item to swap from Pro → Elite.
 * If any line is already Elite price, returns `alreadyElite`.
 * Otherwise prefers an item whose price id is in `proPriceIds`.
 * If no match and there is exactly one non-Elite recurring line, uses that line (legacy / unknown Pro price).
 *
 * @param {Record<string, unknown>} subscription – Stripe Subscription
 * @param {readonly string[]} proPriceIds – configured Pro price IDs (e.g. env STRIPE_PRICE_ID, STRIPE_PRO_PRICE_ID, fallback)
 * @param {string} elitePriceId
 * @returns {{ alreadyElite: boolean; subscriptionItemId: string | null }}
 */
export function findSubscriptionItemForEliteUpgrade(subscription, proPriceIds, elitePriceId) {
  const elite = String(elitePriceId ?? '').trim()
  const items = subscription?.items?.data
  if (!elite || !Array.isArray(items) || items.length === 0) {
    return { alreadyElite: false, subscriptionItemId: null }
  }

  for (const item of items) {
    const p = item?.price
    const pid = typeof p === 'string' ? p : p && typeof p.id === 'string' ? p.id : ''
    if (pid === elite) {
      return { alreadyElite: true, subscriptionItemId: null }
    }
  }

  const proSet = new Set(proPriceIds.map((x) => String(x).trim()).filter(Boolean))
  for (const item of items) {
    const p = item?.price
    const pid = typeof p === 'string' ? p : p && typeof p.id === 'string' ? p.id : ''
    if (pid && proSet.has(pid) && typeof item.id === 'string') {
      return { alreadyElite: false, subscriptionItemId: item.id }
    }
  }

  if (items.length === 1) {
    const item = items[0]
    const p = item?.price
    const pid = typeof p === 'string' ? p : p && typeof p.id === 'string' ? p.id : ''
    if (typeof item?.id === 'string' && pid && pid !== elite) {
      return { alreadyElite: false, subscriptionItemId: item.id }
    }
  }

  return { alreadyElite: false, subscriptionItemId: null }
}
