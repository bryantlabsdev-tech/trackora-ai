import { isOwnerFreePro } from './ownerFreePro.mjs'
import { canUseRefinements, getEffectivePlan, isElitePlan, PLAN_TIER } from './planAccess.mjs'

/** Pro plan: section refinements per calendar month (UTC). Override on server via PRO_MONTHLY_REFINEMENT_LIMIT. */
export const PRO_MONTHLY_REFINEMENT_LIMIT_DEFAULT = 25

/**
 * @param {Date} [d]
 * @returns {string} YYYY-MM in UTC
 */
export function refinementMonthKeyUtc(d = new Date()) {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

/**
 * @param {{ refinement_count?: unknown; refinement_month?: unknown } | null | undefined} profile
 * @returns {{ count: number; monthKey: string | null }}
 */
export function parseRefinementRow(profile) {
  const raw = Number(profile?.refinement_count ?? 0)
  const count = Number.isFinite(raw) ? Math.max(0, Math.trunc(raw)) : 0
  const m = typeof profile?.refinement_month === 'string' ? profile.refinement_month.trim() : ''
  const monthKey = /^\d{4}-\d{2}$/.test(m) ? m : null
  return { count, monthKey }
}

/**
 * Effective refinement count for the current UTC month (treats stale month as 0).
 * @param {{ refinement_count?: unknown; refinement_month?: unknown } | null | undefined} profile
 * @param {Date} [now]
 */
export function effectiveRefinementCountThisMonth(profile, now = new Date()) {
  const key = refinementMonthKeyUtc(now)
  const { count, monthKey } = parseRefinementRow(profile)
  if (monthKey !== key) return 0
  return count
}

/**
 * Next refinement_count / refinement_month after one successful refine (UTC month).
 * New or stale month → count 1; same month → increment by 1.
 * @param {{ refinement_count?: unknown; refinement_month?: unknown } | null | undefined} profile
 * @param {Date} [now]
 */
export function computeNextRefinementState(profile, now = new Date()) {
  const currentMonth = refinementMonthKeyUtc(now)
  const { count, monthKey } = parseRefinementRow(profile)
  if (monthKey === currentMonth) {
    return { refinement_count: count + 1, refinement_month: currentMonth }
  }
  return { refinement_count: 1, refinement_month: currentMonth }
}

/**
 * @param {number} limit
 * @param {{ refinement_count?: unknown; refinement_month?: unknown } | null | undefined} profile
 * @param {unknown} email
 * @param {Date} [now]
 */
export function proRefinementRemaining(limit, profile, email, now = new Date()) {
  if (isElitePlan(profile, email) || isOwnerFreePro(email)) return Number.POSITIVE_INFINITY
  if (!canUseRefinements(profile, email)) return 0
  const used = effectiveRefinementCountThisMonth(profile, now)
  return Math.max(0, limit - used)
}

/**
 * UI + client pre-checks (server still enforces).
 * @param {number} limit
 * @param {{ refinement_count?: unknown; refinement_month?: unknown; email?: unknown; is_pro?: unknown; subscription_status?: unknown } | null | undefined} profile
 * @param {unknown} sessionEmail – auth email if different from profile.email
 */
export function getRefinementQuota(profile, limit, sessionEmail) {
  const email = String(sessionEmail ?? profile?.email ?? '').trim().toLowerCase()
  if (!profile) {
    return {
      used: 0,
      limit,
      remaining: 0,
      unlimited: false,
      canRefine: false,
      label: '—',
      planTier: PLAN_TIER.FREE,
    }
  }
  const planTier = getEffectivePlan(profile, email || profile.email)
  if (isElitePlan(profile, email || profile.email) || isOwnerFreePro(email)) {
    const used = effectiveRefinementCountThisMonth(profile)
    return {
      used,
      limit,
      remaining: Number.POSITIVE_INFINITY,
      unlimited: true,
      canRefine: true,
      label: 'Unlimited refinements',
      planTier,
    }
  }
  if (!canUseRefinements(profile, email || profile.email)) {
    return {
      used: 0,
      limit: 0,
      remaining: 0,
      unlimited: false,
      canRefine: false,
      label: 'Pro or Elite',
      planTier,
    }
  }
  const used = effectiveRefinementCountThisMonth(profile)
  const remaining = Math.max(0, limit - used)
  return {
    used,
    limit,
    remaining,
    unlimited: false,
    canRefine: remaining > 0,
    label: `${used} / ${limit} refinements used`,
    planTier,
  }
}
