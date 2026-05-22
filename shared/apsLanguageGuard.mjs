import { applyApsOperationalCoaching } from './apsOperationalLanguage.mjs'

/**
 * APS realism guard — delegates to operational language bank.
 * @param {string} text
 * @param {{ coachingReason?: string; notes?: string } | null | undefined} payload
 * @returns {string}
 */
export function applyApsLanguageGuard(text, payload) {
  return applyApsOperationalCoaching(text, payload)
}
