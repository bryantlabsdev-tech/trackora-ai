/**
 * Detects cross-topic leakage in coaching form output vs. classified issue.
 * Phrases count as leaks only if they appear in output but not in the user's reason/notes.
 */

/** @typedef {import('./coachingIssueClassifier.mjs').IssuePrimary} IssuePrimary */

const SALES_OR_METRICS = [
  'below goal',
  'off pace',
  'missed sales',
  'missed opportunities to close',
  'customer engagement',
  'store performance',
  'behind goal',
  'not meeting goal',
  'upsell',
  'accessory offer',
  'accessory offers',
  'present offers',
  'conversion',
  'activation',
  'kpi',
  'metrics',
  'closing the sale',
  'close the sale',
  'add-on sales',
]

const ATTENDANCE = [
  'late returning',
  'return from lunch',
  'returning from lunch',
  'tardiness',
  'tardy',
  'late to shift',
  'late for shift',
  'absent',
  'no-call',
  'no call no show',
  'punctuality',
  'clock in',
  'schedule adherence',
]

const SECURITY_OR_KEYS = [
  'keys unattended',
  'left keys',
  'key control',
  'vault',
  'safe handling',
]

/**
 * @param {string} output
 * @param {string} userBlob
 * @param {string[]} phrases
 */
function foreignPhrasePresent(output, userBlob, phrases) {
  const o = output.toLowerCase()
  const u = userBlob.toLowerCase()
  return phrases.some((p) => o.includes(p) && !u.includes(p))
}

/**
 * @param {string} output
 * @param {IssuePrimary} issuePrimary
 * @param {string} userBlob
 * @returns {boolean}
 */
export function coachingOutputViolatesTopicAnchor(output, issuePrimary, userBlob) {
  if (!output || typeof output !== 'string') return false
  if (issuePrimary === 'recognition_positive' || issuePrimary === 'unspecified') return false

  if (issuePrimary === 'compliance_security') {
    return (
      foreignPhrasePresent(output, userBlob, SALES_OR_METRICS) ||
      foreignPhrasePresent(output, userBlob, ATTENDANCE)
    )
  }
  if (issuePrimary === 'attendance') {
    return (
      foreignPhrasePresent(output, userBlob, SALES_OR_METRICS) ||
      foreignPhrasePresent(output, userBlob, SECURITY_OR_KEYS)
    )
  }
  if (issuePrimary === 'performance_sales') {
    return (
      foreignPhrasePresent(output, userBlob, SECURITY_OR_KEYS) ||
      foreignPhrasePresent(output, userBlob, ATTENDANCE)
    )
  }
  return false
}

/**
 * @param {IssuePrimary} issuePrimary
 * @param {string} userBlob
 * @returns {string}
 */
export function buildTopicRetryUserMessage(issuePrimary, userBlob) {
  const u = userBlob.trim() || '(see JSON coachingReason and notes)'
  const base =
    'Your previous answer drifted into topics the user did not raise. Rewrite the ENTIRE coaching form from scratch.\n\n' +
    'Keep the same section headers and order. Write in a natural, human voice—not a stiff template—but stay strictly on the user’s issue.\n\n' +
    `The user’s issue (only reference what fits this): ${u}\n\n`

  if (issuePrimary === 'compliance_security') {
    return (
      base +
      'FOR THIS REWRITE: Focus on security, keys, policy, and accountability around what they wrote. Do NOT mention sales, goals, metrics, offers, accessories, customer engagement, closing, or attendance/punctuality/breaks unless those exact themes appear in coachingReason or notes above.'
    )
  }
  if (issuePrimary === 'attendance') {
    return (
      base +
      'FOR THIS REWRITE: Focus on timeliness, schedule, breaks, and accountability around what they wrote. Do NOT mention keys, vault, safe handling, security policy, OR sales/goals/metrics/offers/engagement/closing unless those exact themes appear in coachingReason or notes above.'
    )
  }
  if (issuePrimary === 'performance_sales') {
    return (
      base +
      'FOR THIS REWRITE: Focus on sales execution, offers, consistency, and goals only as tied to what they wrote. Do NOT mention keys unattended, vault, key control, security policy, OR lateness/absence/punctuality/break return unless those exact themes appear in coachingReason or notes above.'
    )
  }
  return base + 'Do not introduce unrelated problem domains; only expand professionally within the same topic.'
}
