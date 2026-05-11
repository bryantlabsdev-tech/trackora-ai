import { effectivePremiumAccess } from '../../shared/ownerFreePro.mjs'
import { PLAN_TIER, getEffectivePlan } from '../../shared/planAccess.mjs'
import {
  PRO_MONTHLY_REFINEMENT_LIMIT_DEFAULT,
  getRefinementQuota,
} from '../../shared/refinementQuota.mjs'

export { PLAN_TIER, canUseRefinements, getEffectivePlan, isElitePlan, isFreePlan, isProPlan } from '../../shared/planAccess.mjs'
export { isOwnerFreePro } from '../../shared/ownerFreePro.mjs'

/** Must match server default `PRO_MONTHLY_REFINEMENT_LIMIT` (see `.env.example`). */
export const PRO_MONTHLY_REFINEMENT_LIMIT = PRO_MONTHLY_REFINEMENT_LIMIT_DEFAULT

/** Row shape from `public.profiles` (Supabase). */
export type ProfileRow = {
  id: string
  email: string
  is_pro: boolean
  /** Billing tier; synced from Stripe (Pro vs Elite price) and webhooks. */
  plan_tier: 'free' | 'pro' | 'elite'
  usage_count: number
  /** Consumed by increment_ai_usage before usage_count increases (e.g. post-tutorial free run). */
  bonus_ai_generations: number
  /** Section refinements used in `refinement_month` (UTC calendar month). */
  refinement_count?: number
  /** UTC month key `YYYY-MM` aligned with `refinement_count`. */
  refinement_month?: string | null
  has_seen_tutorial: boolean
  has_seen_paywall?: boolean
  /** Server: first tutorial completion granted welcome bonus; replays do not. */
  tutorial_welcome_bonus_granted?: boolean
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: string | null
  current_period_end: string | null
  created_at: string
}

export type Profile = ProfileRow

/** Max AI generations for free tier (must match server default `FREE_LIMIT`, unless you change both). */
export const FREE_AI_GENERATION_LIMIT = 3

/**
 * Pro when Stripe subscription is active/trialing **or** owner allowlist email (see `shared/ownerFreePro.mjs`).
 * Otherwise `past_due` / canceled do not grant access (matches server).
 */
export function hasPremiumAccess(profile: Profile | null): boolean {
  if (!profile) return false
  return effectivePremiumAccess(profile, profile.email)
}

export function canUseAiGeneration(profile: Profile | null): boolean {
  if (!profile) return false
  if (hasPremiumAccess(profile)) return true
  return profile.usage_count < FREE_AI_GENERATION_LIMIT
}

export function freeGenerationsRemaining(profile: Profile): number {
  if (hasPremiumAccess(profile)) return Number.POSITIVE_INFINITY
  return Math.max(0, FREE_AI_GENERATION_LIMIT - profile.usage_count)
}

/** User-facing label for remaining free generations. */
export function freeGenerationsRemainingLabel(profile: Profile): string {
  if (hasPremiumAccess(profile)) return 'Unlimited coaching forms'
  const n = Math.max(0, FREE_AI_GENERATION_LIMIT - profile.usage_count)
  return `${n} free generation${n === 1 ? '' : 's'} left`
}

export function isFreeLimitReached(profile: Profile): boolean {
  return !hasPremiumAccess(profile) && profile.usage_count >= FREE_AI_GENERATION_LIMIT
}

/** Session email should match Supabase JWT when present (owner allowlist). */
export function getRefinementQuotaForProfile(profile: Profile | null, sessionEmail: string | null) {
  return getRefinementQuota(profile, PRO_MONTHLY_REFINEMENT_LIMIT, sessionEmail)
}

export type RefinementQuotaDisplay = ReturnType<typeof getRefinementQuotaForProfile>

/** Short label for settings and sidebar (Free / Pro / Elite). */
export function getPlanDisplayLabel(profile: Profile | null, sessionEmail: string | null): string {
  if (!profile) return 'Free'
  const t = getEffectivePlan(profile, sessionEmail ?? profile.email)
  if (t === PLAN_TIER.ELITE) return 'Elite'
  if (t === PLAN_TIER.PRO) return 'Pro'
  return 'Free'
}
