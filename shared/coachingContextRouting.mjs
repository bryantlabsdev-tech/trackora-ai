/**
 * Conditional routing between:
 * - Mobile Expert wireless coaching context (OSL/Walmart sales lane)
 * - General workplace coaching context
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function norm(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

/**
 * @param {string} role
 */
function isMobileExpertRole(role) {
  const r = norm(role)
  return r === 'me' || r === 'mobile expert' || r === 'mobileexpert'
}

/**
 * @param {string} coachingType
 */
function isMobileExpertCoachingType(coachingType) {
  const t = norm(coachingType)
  return t === 'mobile expert' || t === 'mobileexpert' || t === 'mobile expert coaching'
}

/**
 * Guardrails: terms that indicate this request should stay in general/non-wireless context.
 * @param {string} text
 */
function hasGeneralWorkplaceSignal(text) {
  const t = norm(text)
  return (
    t.includes('general workplace') ||
    t.includes('leadership coaching') ||
    t.includes('customer service coaching') ||
    t.includes('employee writeup') ||
    t.includes('employee write-up') ||
    t.includes('non wireless') ||
    t.includes('non-wireless') ||
    t.includes('non wireless industry') ||
    t.includes('non-wireless industry')
  )
}

const WIRELESS_PERFORMANCE_TOPIC_TERMS = [
  'aps',
  'hpa',
  'mpt',
  'postpaid',
  'prepaid',
  'warp',
  'accessory',
  'accessories',
  'conversion',
  'activation',
  'activations',
  'wireless sales',
  'eligibility check',
  'tablet attempts',
]

/**
 * @param {{
 *   coachingReason?: string
 *   notes?: string
 * }} payload
 */
export function isWirelessSalesPerformanceTopic(payload) {
  const text = norm(`${payload?.coachingReason ?? ''} ${payload?.notes ?? ''}`)
  if (!text) return false
  return WIRELESS_PERFORMANCE_TOPIC_TERMS.some((term) => text.includes(term))
}

/**
 * Returns true only when we should use Mobile Expert wireless context (APS/HPA/MPT + OSL/Walmart sales lane).
 * @param {{
 *   coachingWorkspace?: string
 *   workspace?: string
 *   mode?: string
 *   coachingType?: string
 *   role?: string
 *   coachingReason?: string
 *   notes?: string
 * }} payload
 */
export function shouldUseMobileExpertContext(payload) {
  const workspace = norm(payload?.coachingWorkspace || payload?.workspace)
  const isWirelessWorkspace = workspace === 'mobile sales' || workspace === 'mobile_sales'
  if (!isWirelessWorkspace) return false

  const mode = norm(payload?.mode)
  if (mode && mode !== 'coaching' && mode !== 'recognition') return false

  const coachingType = String(payload?.coachingType ?? '')
  const role = String(payload?.role ?? '')
  const reasonAndNotes = `${payload?.coachingReason ?? ''} ${payload?.notes ?? ''}`

  if (hasGeneralWorkplaceSignal(reasonAndNotes)) return false

  // Explicit selections have priority.
  if (coachingType && !isMobileExpertCoachingType(coachingType)) return false
  if (role && !isMobileExpertRole(role)) return false
  if (isMobileExpertCoachingType(coachingType) || isMobileExpertRole(role)) return true

  // Backward-compatible default for existing mobile workspace flows with no explicit role/type fields yet.
  return true
}

