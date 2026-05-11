import { effectivePremiumAccess, isOwnerFreePro } from './ownerFreePro.mjs'

/** Canonical plan tier strings (DB `profiles.plan_tier` + API). */
export const PLAN_TIER = Object.freeze({
  FREE: 'free',
  PRO: 'pro',
  ELITE: 'elite',
})

/**
 * @param {unknown} raw
 * @returns {typeof PLAN_TIER[keyof typeof PLAN_TIER]}
 */
function normalizeStoredTier(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === PLAN_TIER.ELITE) return PLAN_TIER.ELITE
  if (s === PLAN_TIER.PRO) return PLAN_TIER.PRO
  return PLAN_TIER.FREE
}

/**
 * Resolved tier for product logic (owner allowlist → elite; paid inactive → free).
 * @param {{ plan_tier?: unknown; email?: unknown; is_pro?: boolean; subscription_status?: string | null } | null | undefined} profile
 * @param {unknown} email – session JWT email preferred when passed from server
 * @returns {typeof PLAN_TIER[keyof typeof PLAN_TIER]}
 */
export function getEffectivePlan(profile, email) {
  if (!profile || typeof profile !== 'object') return PLAN_TIER.FREE
  const em =
    String(email ?? '').trim().toLowerCase() || String(profile.email ?? '').trim().toLowerCase()
  if (!effectivePremiumAccess(profile, em)) return PLAN_TIER.FREE
  if (isOwnerFreePro(em)) return PLAN_TIER.ELITE
  const stored = normalizeStoredTier(profile.plan_tier)
  if (stored === PLAN_TIER.ELITE) return PLAN_TIER.ELITE
  /** Active paid without explicit elite in DB → Pro (Stripe sync sets elite when price matches). */
  return PLAN_TIER.PRO
}

/**
 * @param {{ plan_tier?: unknown; email?: unknown; is_pro?: boolean; subscription_status?: string | null } | null | undefined} profile
 * @param {unknown} email
 */
export function isFreePlan(profile, email) {
  return getEffectivePlan(profile, email) === PLAN_TIER.FREE
}

/**
 * @param {{ plan_tier?: unknown; email?: unknown; is_pro?: boolean; subscription_status?: string | null } | null | undefined} profile
 * @param {unknown} email
 */
export function isProPlan(profile, email) {
  return getEffectivePlan(profile, email) === PLAN_TIER.PRO
}

/**
 * @param {{ plan_tier?: unknown; email?: unknown; is_pro?: boolean; subscription_status?: string | null } | null | undefined} profile
 * @param {unknown} email
 */
export function isElitePlan(profile, email) {
  return getEffectivePlan(profile, email) === PLAN_TIER.ELITE
}

/**
 * Pro and Elite (and owner) may call refine_section; server still enforces caps.
 * @param {{ plan_tier?: unknown; email?: unknown; is_pro?: boolean; subscription_status?: string | null } | null | undefined} profile
 * @param {unknown} email
 */
export function canUseRefinements(profile, email) {
  const t = getEffectivePlan(profile, email)
  return t === PLAN_TIER.PRO || t === PLAN_TIER.ELITE
}
