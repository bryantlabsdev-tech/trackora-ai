/** Row shape from `public.profiles` (Supabase). */
export type ProfileRow = {
  id: string
  email: string
  is_pro: boolean
  usage_count: number
  /** Consumed by increment_ai_usage before usage_count increases (e.g. post-tutorial free run). */
  bonus_ai_generations: number
  has_seen_tutorial: boolean
  has_seen_paywall?: boolean
  /** Server: first tutorial completion granted welcome bonus; replays do not. */
  tutorial_welcome_bonus_granted?: boolean
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: string | null
  current_period_end: string | null
  plan: string | null
  created_at: string
}

export type Profile = ProfileRow

/** Max AI generations for free tier (must match server default `FREE_LIMIT`, unless you change both). */
export const FREE_AI_GENERATION_LIMIT = 3

export function canUseAiGeneration(profile: Profile | null): boolean {
  if (!profile) return false
  if (profile.is_pro) return true
  return profile.usage_count < FREE_AI_GENERATION_LIMIT
}

export function freeGenerationsRemaining(profile: Profile): number {
  if (profile.is_pro) return Number.POSITIVE_INFINITY
  return Math.max(0, FREE_AI_GENERATION_LIMIT - profile.usage_count)
}

/** User-facing label for remaining free generations. */
export function freeGenerationsRemainingLabel(profile: Profile): string {
  if (profile.is_pro) return 'Unlimited AI generations'
  const n = Math.max(0, FREE_AI_GENERATION_LIMIT - profile.usage_count)
  return `${n} free generation${n === 1 ? '' : 's'} left`
}

export function isFreeLimitReached(profile: Profile): boolean {
  return !profile.is_pro && profile.usage_count >= FREE_AI_GENERATION_LIMIT
}
