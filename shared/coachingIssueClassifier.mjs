/**
 * Deterministic issue classification from user-provided coaching text (reason + notes).
 * Used to constrain AI prompts so output stays grounded and category-appropriate.
 */

import { formatPersonName } from './coachingOutput.mjs'
import { isLightReminderCoaching, stripToneOnlyNotes } from './coachingReminderTone.mjs'
import { parseCoachingWorkspace } from './coachingWorkspace.mjs'
import {
  isWirelessSalesPerformanceTopic,
  shouldUseMobileExpertContext,
} from './coachingContextRouting.mjs'
import { evaluateOslMetricIntelligence } from './oslMetricIntelligence.mjs'

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
  const workspace = parseCoachingWorkspace(payload?.coachingWorkspace)
  const useMobileExpertContext =
    workspace === 'mobile_sales' && shouldUseMobileExpertContext(payload)
  const blob = normalizeIssueText(`${payload?.coachingReason ?? ''} ${payload?.notes ?? ''}`)
  const { primary } = classifyIssue(blob, mode)
  const rawName = String(payload?.employeeName ?? '')
  const name = formatPersonName(rawName)
  const reason = String(payload?.coachingReason ?? '').trim() || 'the documented concern'
  const notes = String(payload?.notes ?? '').trim()
  const notesBit = notes ? ` ${notes}` : ''

  if (mode === 'recognition') {
    const metricIntel =
      useMobileExpertContext && isWirelessSalesPerformanceTopic(payload)
        ? evaluateOslMetricIntelligence(`${payload?.coachingReason ?? ''} ${payload?.notes ?? ''}`, 'recognition')
        : { metrics: {}, combinedInsight: null }
    const wins = [
      metricIntel.metrics.aps?.status === 'on_track'
        ? `APS ${metricIntel.metrics.aps.value} is on track (goal >= 3.5), showing strong customer attempts and floor engagement`
        : '',
      metricIntel.metrics.hpa?.status === 'on_track'
        ? `HPA ${metricIntel.metrics.hpa.value} is on track (goal <= 6.0), showing efficient activation productivity`
        : '',
      metricIntel.metrics.mpt?.status === 'on_track'
        ? `MPT ${metricIntel.metrics.mpt.value} is on track (goal <= 45), showing strong transaction flow`
        : '',
    ].filter(Boolean)

    const pre = `${name} — ${reason}.${notesBit} Want to recognize the positive contribution described.`
    const category = `Recognition — ${reason}.`
    const situation =
      wins.length > 0
        ? `${name} demonstrated strong wireless execution: ${wins.join('; ')}.`
        : `${name} demonstrated the behavior noted above.`
    const behavior = notes
      ? `${name} — ${reason}. ${notes}`
      : `${name} — ${reason}.`
    const impact =
      wins.length > 0
        ? `This supports conversion flow and keeps electronics traffic moving with better consistency.`
        : `This supports the team when people step up as described.`
    const nextSteps =
      wins.length > 0
        ? `• Keep current APS/HPA/MPT execution habits\n• Continue strong discovery and conversion rhythm\n• Share what is working with the team during the next shift`
        : `• Continue the strengths shown\n• Keep setting a solid example for the team\n• Build on what is working`
    const followUp = `Will continue to encourage this behavior and check in on how things are going.`
    return joinSections(pre, category, situation, behavior, impact, nextSteps, followUp)
  }

  if (isLightReminderCoaching(notes, reason)) {
    return buildLightReminderDeterministicForm(name, reason, notes, primary, workspace)
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
      const metricIntel =
        useMobileExpertContext
          ? evaluateOslMetricIntelligence(`${payload?.coachingReason ?? ''} ${payload?.notes ?? ''}`)
          : { metrics: {}, combinedInsight: null }
      const metricRows = [
        metricIntel.metrics.aps
          ? `APS ${metricIntel.metrics.aps.value} (${metricIntel.metrics.aps.severityLabel} vs >= 3.5)`
          : '',
        metricIntel.metrics.hpa
          ? `HPA ${metricIntel.metrics.hpa.value} (${metricIntel.metrics.hpa.severityLabel} vs <= 6.0)`
          : '',
        metricIntel.metrics.mpt
          ? `MPT ${metricIntel.metrics.mpt.value} (${metricIntel.metrics.mpt.severityLabel} vs <= 45)`
          : '',
      ].filter(Boolean)

      const category =
        useMobileExpertContext && metricRows.length > 0
          ? `Performance / Wireless Metrics — ${metricRows.join('; ')}.`
          : `Performance — ${issueRef}.`

      const situation =
        useMobileExpertContext && metricRows.length > 0
          ? `${name}, current metrics show: ${metricRows.join('; ')}.`
          : `${name}, the focus is: ${reason}.`

      let behavior = `Execution needs to line up with what was described—stay specific to that topic.`
      if (useMobileExpertContext && metricIntel.combinedInsight) {
        behavior = `${metricIntel.combinedInsight.diagnosis} Focus on ${metricIntel.combinedInsight.coachingFocus.join(' and ')}.`
      } else if (useMobileExpertContext && metricRows.length > 0) {
        const focus = []
        if (metricIntel.metrics.aps?.status === 'needs_coaching') {
          focus.push('raising customer approaches and engagement volume')
        }
        if (metricIntel.metrics.hpa?.status === 'needs_coaching') {
          focus.push('improving discovery-to-close productivity')
        }
        if (metricIntel.metrics.mpt?.status === 'needs_coaching') {
          focus.push('speeding up activation process flow')
        }
        if (focus.length > 0) {
          behavior = `Coaching focus: ${focus.join(', ')}.`
        }
      }
      const impact =
        workspace === 'general_workplace'
          ? `When expectations slip on what we track, it affects team results and trust.`
          : `When execution slips on what we track, it affects results the team is responsible for.`
      let nextSteps = `• Address the specific gap described above\n• Ask for clarification on expectations if needed\n• Manager check-in to review progress`
      if (useMobileExpertContext && metricIntel.combinedInsight) {
        nextSteps = `• 7-day plan: ${metricIntel.combinedInsight.coachingFocus[0]}\n• 7-day plan: ${metricIntel.combinedInsight.coachingFocus[1]}\n• Track APS/HPA/MPT daily and review with Team Lead in 3-7 days`
      } else if (useMobileExpertContext && metricRows.length > 0) {
        /** @type {string[]} */
        const bullets = []
        if (metricIntel.metrics.aps?.status === 'needs_coaching') {
          bullets.push('7-day plan: Minimum 10 tablet attempts per shift with stronger floor presence')
        }
        if (metricIntel.metrics.hpa?.status === 'needs_coaching') {
          bullets.push('7-day plan: Tighten discovery and conversion urgency during peak traffic windows')
        }
        if (metricIntel.metrics.mpt?.status === 'needs_coaching') {
          bullets.push('7-day plan: Reset within 5 minutes after each transaction and prep next activation step earlier')
        }
        if (bullets.length > 0) {
          while (bullets.length < 2) bullets.push('7-day plan: Ask discovery questions with every electronics customer')
          bullets.push('Track APS/HPA/MPT daily and review with Team Lead in 3-7 days')
          nextSteps = bullets.map((b) => `• ${b}`).join('\n')
        }
      }
      const followUp = `Quick metric follow-up in 3-7 days to review trend progress and adjust focus.`
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

/**
 * Softer, shorter reminder-style form when notes signal informal / reminder coaching.
 * @param {string} name
 * @param {string} reason
 * @param {string} notes
 * @param {IssuePrimary} primary
 * @param {'mobile_sales' | 'general_workplace'} workspace
 */
function buildLightReminderDeterministicForm(name, reason, notes, primary, workspace) {
  const extra = stripToneOnlyNotes(notes)
  const hay = `${reason} ${notes}`.toLowerCase()
  const noBreakSchedule = hay.includes('no break schedule')
  const breakTopic = /\bbreak\b|\blunch\b|\bclock\b/i.test(`${reason} ${notes}`)

  const category = (() => {
    if (primary === 'attendance') {
      return breakTopic ? 'Attendance / Break Reminder' : 'Attendance / Schedule Reminder'
    }
    if (primary === 'compliance_security') return 'Security / Procedure Reminder'
    if (primary === 'performance_sales') return 'Performance Check-in Reminder'
    return 'Coaching Reminder'
  })()

  const r = reason.endsWith('.') ? reason : `${reason}.`
  let pre
  if (primary === 'attendance' && breakTopic) {
    pre = `${name}, just wanted to mention the break timing from today. ${r}`
  } else {
    pre = `${name}, just wanted to bring this up. ${r}`
  }
  if (extra) {
    pre += ` ${extra.endsWith('.') ? extra : `${extra}.`}`
  }

  const situation = r

  let behavior
  if (primary === 'attendance' && breakTopic) {
    if (noBreakSchedule) {
      behavior =
        workspace === 'general_workplace'
          ? `Not a huge issue—just try to keep break timing reasonable and follow how we usually handle breaks during the workday.`
          : `Not a huge issue—just try to keep break timing reasonable and clock lunch the way we usually run it on the floor.`
    } else {
      behavior =
        workspace === 'general_workplace'
          ? `Not a huge issue—just try to keep breaks reasonable through the day and wrap up meal breaks on time.`
          : `Not a huge issue—just try to keep breaks reasonable throughout the day and clock lunch out like we talked about.`
    }
  } else if (primary === 'compliance_security') {
    behavior = `Wanted to make sure we keep this cleaned up going ahead—nothing wild, just stay on top of it.`
  } else {
    behavior = `Not a huge issue—just try to tighten this up based on what we went over.`
  }

  let impact
  if (primary === 'attendance') {
    impact = `Helps us keep coverage balanced for everyone.`
  } else if (primary === 'compliance_security') {
    impact = `Keeps the day smooth and everyone on the same page.`
  } else if (primary === 'performance_sales') {
    impact =
      workspace === 'general_workplace'
        ? `Helps the team stay aligned when we stay on top of this.`
        : `Helps the shift run cleaner when we stay on top of this.`
  } else {
    impact = `Keeps things running smoother for the team.`
  }

  let nextSteps
  if (primary === 'attendance' && breakTopic) {
    nextSteps = `• Keep an eye on break timing\n• Reach out if scheduling gets messy`
    if (!noBreakSchedule) {
      nextSteps +=
        workspace === 'general_workplace'
          ? `\n• Return from meal breaks on time`
          : `\n• Clock out for lunch like usual`
    }
  } else {
    nextSteps = `• Keep an eye on what we discussed\n• Flag me if something’s getting in the way`
  }

  const followUp = `Just a quick reminder conversation.`

  return joinSections(pre, category, situation, behavior, impact, nextSteps, followUp)
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
