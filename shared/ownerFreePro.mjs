import { profileRowGrantsPremium } from './billingSubscription.mjs'

/**
 * Private allowlist: these accounts get full paid capability without Stripe (JWT email).
 * Product tier resolves to **Elite** in `shared/planAccess.mjs` (unlimited refinements + founder access).
 */
export const OWNER_FREE_PRO_EMAILS = ['ferrisbryant17@yahoo.com']

/**
 * @param {unknown} email
 * @returns {boolean}
 */
export function isOwnerFreePro(email) {
  return OWNER_FREE_PRO_EMAILS.includes(String(email ?? '').trim().toLowerCase())
}

/**
 * Stripe/subscription Pro OR owner allowlist only (same rule everywhere).
 * @param {{ is_pro?: boolean; subscription_status?: string | null } | null | undefined} profile
 * @param {unknown} email Session / profile email (lowercased inside isOwnerFreePro)
 * @returns {boolean}
 */
export function effectivePremiumAccess(profile, email) {
  return profileRowGrantsPremium(profile) || isOwnerFreePro(email)
}
