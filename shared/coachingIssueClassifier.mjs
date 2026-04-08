/**
 * Deterministic issue classification from user-provided coaching text (reason + notes).
 * Used to constrain AI prompts so output stays grounded and category-appropriate.
 */

import { formatPersonName } from './coachingOutput.mjs'

/** @typedef {'compliance_security' | 'attendance' | 'performance_sales' | 'recognition_positive' | 'unspecified'} IssuePrimary */

const COMPLIANCE = [
  /\bkeys?\b/i,
  /\bunattended\b/i,
  /\bsecurity\b/i,
  /\bsafe\b/i,
  /\block\b/i,
  /\bunlocked\b/i,
  /\bcompliance\b/i,
  /\bpolicy\b/i,
  /\bviolation\b/i,
  /\bvault\b/i,
  /\bbadge\b/i,
  /\balarm\b/i,
]

const ATTENDANCE = [
  /\blate\b/i,
  /\btardy\b/i,
  /\btardiness\b/i,
  /\babsent\b/i,
  /\babsence\b/i,
  /\bno[\s-]?call\b/i,
  /\blunch\b/i,
  /\bbreak\b/i,
  /\breturn(?:ing)?\s+from\b/i,
  /\bclock\b/i,
  /\bschedule\b/i,
  /\bpunctual/i,
  /\bshift\b/i,
]

const PERFORMANCE = [
  /\bsales?\b/i,
  /\bgoal\b/i,
  /\bgoals\b/i,
  /\bkpi\b/i,
  /\bmetric\b/i,
  /\boffer\b/i,
  /\boffers\b/i,
  /\baccessory\b/i,
  /\baccessories\b/i,
  /\bactivation\b/i,
  /\bupsell\b/i,
  /\bconversion\b/i,
  /\bclose\b/i,
  /\bclosing\b/i,
  /\bcustomer\s+engagement\b/i,
  /\bengagement\b/i,
  /\baps\b/i,
]

const RECOGNITION_POSITIVE = [
  /\bgreat\s+job\b/i,
  /\bthank\s+you\b/i,
  /\bhelped\b/i,
  /\bteamwork\b/i,
  /\bappreciate\b/i,
  /\brecognition\b/i,
  /\bexcellent\b/i,
  /\boutstanding\b/i,
]

/**
 * @param {string} raw
 * @returns {string}
 */
export function normalizeIssueText(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * @param {string} blob
 * @param {'coaching' | 'recognition'} mode
 * @returns {{ primary: IssuePrimary; mode: 'coaching' | 'recognition' }}
 */
export function classifyIssue(blob, mode) {
  const text = normalizeIssueText(blob).toLowerCase()

  if (mode === 'recognition') {
    return { primary: 'recognition_positive', mode }
  }

  const hit = (patterns) => patterns.some((re) => re.test(text))

  if (hit(COMPLIANCE)) return { primary: 'compliance_security', mode }
  if (hit(ATTENDANCE)) return { primary: 'attendance', mode }
  if (hit(PERFORMANCE)) return { primary: 'performance_sales', mode }
  if (hit(RECOGNITION_POSITIVE)) return { primary: 'recognition_positive', mode }

  return { primary: 'unspecified', mode }
}

/**
 * @param {IssuePrimary} primary
 * @param {'coaching' | 'recognition'} mode
 * @returns {string}
 */
export function buildCoachingClassRules(primary, mode) {
  if (mode === 'recognition') {
    return [
      'TOPIC: recognition — celebrate what the user described.',
      'Stay specific to coachingReason and notes; polish the wording but do not invent customers, numbers, or new story beats.',
      'Keep the tone warm and professional, not generic boilerplate.',
    ].join('\n')
  }

  const common = [
    'TOPIC ANCHOR (lightweight—guides tone and category, not a script):',
    'Stay on the same subject as coachingReason/notes. Rephrase clearly and professionally; you may add closely related workplace context (expectations, standards, accountability) that fits that same subject.',
    'Do not pivot to a different kind of problem. Do not invent new incidents, metrics, or people.',
    'Sales/goals/metrics/offers/engagement/closing: only if the user’s text is about sales or performance.',
    'Attendance/punctuality/breaks/schedule: only if the user’s text is about attendance.',
    'Keys/security/policy/safe handling: only if the user’s text is about security or policy.',
  ]

  switch (primary) {
    case 'compliance_security':
      return [
        ...common,
        'Suggested category flavor: Compliance / Security / Policy (match the user’s words).',
        'Expand with key control, security expectations, accountability, and standards—natural sentences, not a checklist of unrelated themes.',
      ].join('\n')
    case 'attendance':
      return [
        ...common,
        'Suggested category flavor: Attendance / Punctuality / Schedule.',
        'Expand with timeliness, reliability, and schedule expectations—stay human and direct.',
      ].join('\n')
    case 'performance_sales':
      return [
        ...common,
        'Suggested category flavor: Performance / sales execution (because the user raised it).',
        'Expand with consistency, offers, and execution tied to what they wrote—no invented KPIs.',
      ].join('\n')
    case 'recognition_positive':
      return [
        ...common,
        'No single bucket matched strongly—keep coaching tied to the exact issue; stay neutral and professional.',
      ].join('\n')
    default:
      return [
        ...common,
        'General coaching: mirror the user’s issue; avoid defaulting to a sales or attendance storyline.',
      ].join('\n')
  }
}

/**
 * For tests: terms that must NOT appear in model output for a given class (unless user included them).
 * @param {IssuePrimary} primary
 * @param {'coaching' | 'recognition'} mode
 * @returns {string[]}
 */
export function leakTestForbiddenTerms(primary, mode) {
  if (mode === 'recognition') return []
  if (primary === 'compliance_security') {
    return ['below goal', 'customer engagement', 'accessory', 'closing', 'missed sales', 'store behind goal']
  }
  if (primary === 'attendance') {
    return ['safe', 'vault', 'keys unattended', 'policy violation', 'accessory offers', 'below goal']
  }
  if (primary === 'performance_sales') {
    return ['keys unattended', 'left keys', 'vault', 'compliance violation', 'safe handling']
  }
  return []
}

/**
 * Copy-ready coaching/recognition form when the model is unavailable — same classification as prompts.
 * @param {{ employeeName?: string; coachingReason?: string; notes?: string; mode?: string }} payload
 * @returns {string}
 */
export function buildDeterministicCoachingForm(payload) {
  const mode = payload?.mode === 'recognition' ? 'recognition' : 'coaching'
  const blob = normalizeIssueText(`${payload?.coachingReason ?? ''} ${payload?.notes ?? ''}`)
  const { primary } = classifyIssue(blob, mode)
  const rawName = String(payload?.employeeName ?? '')
  const name = formatPersonName(rawName)
  const reason = String(payload?.coachingReason ?? '').trim() || 'the documented concern'
  const notes = String(payload?.notes ?? '').trim()
  const notesBit = notes ? ` ${notes}` : ''

  if (mode === 'recognition') {
    const pre = `${name} — ${reason}.${notesBit} Want to recognize the positive contribution described.`
    const category = `Recognition — ${reason}.`
    const situation = `${name} demonstrated the behavior noted above.`
    const behavior = notes
      ? `${name} — ${reason}. ${notes}`
      : `${name} — ${reason}.`
    const impact = `This supports the team when people step up as described.`
    const nextSteps = `• Continue the strengths shown\n• Keep setting a solid example for the team\n• Build on what is working`
    const followUp = `Will continue to encourage this behavior and check in on how things are going.`
    return joinSections(pre, category, situation, behavior, impact, nextSteps, followUp)
  }

  const issueRef = reason.endsWith('.') ? reason.slice(0, -1) : reason

  switch (primary) {
    case 'compliance_security': {
      const pre = `${name} — ${reason}${notesBit}`
      const category = `Compliance / Security / Policy — ${issueRef}.`
      const situation = `${name}, the concern is: ${reason}.`
      const behavior = `What was reported needs to align with required procedures—no extra assumptions beyond what was stated.`
      const impact = `Gaps in policy and security expectations need to be taken seriously and corrected.`
      const nextSteps = `• Review and follow the relevant policy steps that apply to this situation\n• Ask your manager if anything is unclear\n• Manager check-in to confirm expectations are met going forward`
      const followUp = `Follow up on the next visit to confirm the issue is addressed and standards are met.`
      return joinSections(pre, category, situation, behavior, impact, nextSteps, followUp)
    }
    case 'attendance': {
      const pre = `${name} — ${reason}${notesBit}`
      const category = `Attendance / Punctuality — ${issueRef}.`
      const situation = `${name}, the concern is: ${reason}.`
      const behavior = `Timeliness and reliability need to match team expectations.`
      const impact = `Attendance issues affect coverage and trust with the team.`
      const nextSteps = `• Arrive and return from breaks on time as scheduled\n• Communicate early if a conflict comes up\n• Manager check-in to confirm improvement`
      const followUp = `Follow up next shift to confirm attendance expectations are being met.`
      return joinSections(pre, category, situation, behavior, impact, nextSteps, followUp)
    }
    case 'performance_sales': {
      const pre = `${name} — ${reason}${notesBit}`
      const category = `Performance — ${issueRef}.`
      const situation = `${name}, the focus is: ${reason}.`
      const behavior = `Execution needs to line up with what was described—stay specific to that topic.`
      const impact = `When execution slips on what we track, it affects results the team is responsible for.`
      const nextSteps = `• Address the specific gap described above\n• Ask for clarification on expectations if needed\n• Manager check-in to review progress`
      const followUp = `Follow up on the next visit to review progress on the topic discussed.`
      return joinSections(pre, category, situation, behavior, impact, nextSteps, followUp)
    }
    default: {
      const pre = `${name} — ${reason}${notesBit}`
      const category = `Coaching — ${issueRef}.`
      const situation = `${name}, we need to address: ${reason}.`
      const behavior = `Stay focused on the stated concern—no unrelated topics.`
      const impact = `Unresolved issues like this can affect team standards if not corrected.`
      const nextSteps = `• Correct the specific concern described\n• Ask your manager if you need clarity\n• Manager check-in to confirm improvement`
      const followUp = `Follow up on the next visit to confirm the concern is resolved.`
      return joinSections(pre, category, situation, behavior, impact, nextSteps, followUp)
    }
  }
}

/** @param {string} pre @param {string} category @param {string} situation @param {string} behavior @param {string} impact @param {string} next @param {string} follow */
function joinSections(pre, category, situation, behavior, impact, next, follow) {
  return [
    `Pre-Coaching Notes:\n${pre}\n`,
    `Coaching Category:\n${category}\n`,
    `Situation:\n${situation}\n`,
    `Behavior:\n${behavior}\n`,
    `Impact:\n${impact}\n`,
    `Next Steps:\n${next}\n`,
    `Manager Follow-Up:\n${follow}\n`,
  ].join('\n')
}
