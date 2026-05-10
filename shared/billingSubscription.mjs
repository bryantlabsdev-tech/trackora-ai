/**
 * Single source for Stripe subscription → Pro eligibility (server, scripts, tests).
 * Pro is only granted for `active` and `trialing`. No grace for `past_due`.
 */

/**
 * @param {unknown} status Stripe subscription.status
 * @returns {boolean}
 */
export function stripeSubscriptionStatusGrantsPro(status) {
  if (typeof status !== 'string') return false
  const s = status.trim().toLowerCase()
  return s === 'active' || s === 'trialing'
}

/**
 * @param {number | null | undefined} unixSeconds
 * @returns {string | null}
 */
export function toIsoFromUnixSeconds(unixSeconds) {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return null
  return new Date(unixSeconds * 1000).toISOString()
}

/**
 * @param {{ status?: string; current_period_end?: number }} subscription
 * @returns {{
 *   isPro: boolean
 *   reason: string
 *   subscriptionStatus: string | null
 *   currentPeriodEndIso: string | null
 * }}
 */
export function evaluateSubscriptionAccess(subscription) {
  const status = typeof subscription.status === 'string' ? subscription.status : null
  const currentPeriodEndUnix =
    typeof subscription.current_period_end === 'number' ? subscription.current_period_end : null
  const currentPeriodEndIso = toIsoFromUnixSeconds(currentPeriodEndUnix)
  const isPro = stripeSubscriptionStatusGrantsPro(status)

  return {
    isPro,
    reason: isPro ? `status_${status}` : status ? `status_${status}_not_pro` : 'status_missing',
    subscriptionStatus: status,
    currentPeriodEndIso,
  }
}

/**
 * Row-level Pro check (stale is_pro vs subscription_status).
 * @param {{ is_pro?: boolean; subscription_status?: string | null }} profile
 * @returns {boolean}
 */
export function profileRowGrantsPremium(profile) {
  return Boolean(profile?.is_pro) && stripeSubscriptionStatusGrantsPro(profile?.subscription_status)
}
