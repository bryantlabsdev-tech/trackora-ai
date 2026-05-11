/**
 * Coaching “workspace” — drives UI topics and server prompts (retail mobile vs general workplace).
 * @typedef {'mobile_sales' | 'general_workplace'} CoachingWorkspace
 */

/** @type {CoachingWorkspace[]} */
export const COACHING_WORKSPACE_IDS = ['mobile_sales', 'general_workplace']

/** @type {CoachingWorkspace} */
export const DEFAULT_COACHING_WORKSPACE = 'mobile_sales'

/**
 * @param {unknown} raw
 * @returns {CoachingWorkspace}
 */
export function parseCoachingWorkspace(raw) {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (s === 'general_workplace') return 'general_workplace'
  return 'mobile_sales'
}
