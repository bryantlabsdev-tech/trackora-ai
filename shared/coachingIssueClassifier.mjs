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
import {
  APS_NEXT_STEPS_BULLETS,
  buildApsOnlyOperationalSections,
} from './apsOperationalLanguage.mjs'
import { normalizeFrontlineVocabulary } from './frontlineVocabulary.mjs'

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

const WORKPLACE_BEHAVIOR = [
  /\baccountability\b/i,
  /\bfollow[-\s]?through\b/i,
  /\bproductivity\b/i,
  /\bcommunication\b/i,
  /\bteamwork\b/i,
  /\bcustomer\s+service\b/i,
  /\bguest\s+service\b/i,
  /\bprofessionalism\b/i,
  /\bconduct\b/i,
]

const CATEGORY_WEIGHTED_PATTERNS = {
  compliance_security: [
    [/\bkeys?\b/i, 1.4],
    [/\bunattended\b/i, 1.2],
    [/\bsecurity\b/i, 1.1],
    [/\bpolicy\b/i, 1.0],
    [/\bviolation\b/i, 1.0],
    [/\bvault\b/i, 1.2],
    [/\bsafe\b/i, 0.9],
    [/\balarm\b/i, 0.9],
  ],
  attendance: [
    [/\blate\b/i, 1.2],
    [/\btardy\b/i, 1.2],
    [/\babsent\b/i, 1.2],
    [/\bno[\s-]?call\b/i, 1.1],
    [/\blunch\b/i, 0.9],
    [/\bbreak\b/i, 0.9],
    [/\breturn(?:ing)?\s+from\b/i, 0.9],
    [/\bclock\b/i, 0.8],
    [/\bschedule\b/i, 0.8],
    [/\bpunctual/i, 1.0],
    [/\bshift\b/i, 0.35],
  ],
  performance_sales: [
    [/\baps\b/i, 1.4],
    [/\bhpa\b/i, 1.4],
    [/\bmpt\b/i, 1.4],
    [/\bactivation\b/i, 1.2],
    [/\bpostpaid\b/i, 1.2],
    [/\bprepaid\b/i, 1.0],
    [/\bconversion\b/i, 1.1],
    [/\bclosing\b/i, 1.0],
    [/\bcustomer\s+engagement\b/i, 1.0],
    [/\baccessor(?:y|ies)\b/i, 1.0],
    [/\bwireless\s+sales\b/i, 1.1],
    [/\bgoal\b/i, 0.7],
    [/\bmetric\b/i, 0.8],
  ],
  recognition_positive: [
    [/\bgreat\s+job\b/i, 1.1],
    [/\bthank\s+you\b/i, 1.0],
    [/\bappreciate\b/i, 1.0],
    [/\brecognition\b/i, 1.0],
    [/\bexcellent\b/i, 1.0],
    [/\boutstanding\b/i, 1.1],
  ],
  workplace_behavior: WORKPLACE_BEHAVIOR.map((re) => [re, 1.0]),
}

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
 * @param {string} text
 * @param {Array<[RegExp, number]>} weightedPatterns
 */
function scoreWeightedPatterns(text, weightedPatterns) {
  let score = 0
  for (const [re, weight] of weightedPatterns) {
    if (re.test(text)) score += weight
  }
  return score
}

/**
 * @param {string} blob
 * @param {'coaching' | 'recognition'} mode
 * @returns {{ primary: IssuePrimary; mode: 'coaching' | 'recognition'; confidence: number; scores: Record<string, number> }}
 */
export function classifyIssueWithConfidence(blob, mode) {
  const text = normalizeIssueText(blob).toLowerCase()

  if (mode === 'recognition') {
    return {
      primary: 'recognition_positive',
      mode,
      confidence: 1,
      scores: { recognition_positive: 1 },
    }
  }

  const scores = {
    compliance_security: scoreWeightedPatterns(text, CATEGORY_WEIGHTED_PATTERNS.compliance_security),
    attendance: scoreWeightedPatterns(text, CATEGORY_WEIGHTED_PATTERNS.attendance),
    performance_sales: scoreWeightedPatterns(text, CATEGORY_WEIGHTED_PATTERNS.performance_sales),
    recognition_positive: scoreWeightedPatterns(text, CATEGORY_WEIGHTED_PATTERNS.recognition_positive),
    workplace_behavior: scoreWeightedPatterns(text, CATEGORY_WEIGHTED_PATTERNS.workplace_behavior),
  }

  /** @type {Array<[string, number]>} */
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const [topLabel, topScore] = ranked[0] || ['unspecified', 0]
  const secondScore = ranked[1]?.[1] ?? 0
  const margin = topScore - secondScore
  const confidence = topScore <= 0 ? 0 : Math.max(0, Math.min(1, topScore / 3.2 + margin / 4))

  // Confidence/routing guardrail to reduce attendance-style leakage in ambiguous text.
  if (topScore < 0.95 || margin < 0.15) {
    return { primary: 'unspecified', mode, confidence, scores }
  }

  if (topLabel === 'workplace_behavior') {
    return { primary: 'unspecified', mode, confidence, scores }
  }
  if (topLabel === 'compliance_security') {
    return { primary: 'compliance_security', mode, confidence, scores }
  }
  if (topLabel === 'attendance') {
    return { primary: 'attendance', mode, confidence, scores }
  }
  if (topLabel === 'performance_sales') {
    return { primary: 'performance_sales', mode, confidence, scores }
  }
  if (topLabel === 'recognition_positive') {
    return { primary: 'recognition_positive', mode, confidence, scores }
  }
  return { primary: 'unspecified', mode, confidence, scores }
}

/**
 * @param {string} blob
 * @param {'coaching' | 'recognition'} mode
 * @returns {{ primary: IssuePrimary; mode: 'coaching' | 'recognition' }}
 */
export function classifyIssue(blob, mode) {
  const { primary } = classifyIssueWithConfidence(blob, mode)
  return { primary, mode }
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
 * @param {string} s
 */
function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h >>> 0)
}

/**
 * Pick a phrase variant while avoiding repeated phrase reuse in a single form.
 * @param {string[]} options
 * @param {string} seed
 * @param {Set<string>} used
 * @returns {string}
 */
function pickVariant(options, seed, used) {
  if (!Array.isArray(options) || options.length === 0) return ''
  const start = hashString(seed) % options.length
  for (let i = 0; i < options.length; i += 1) {
    const candidate = options[(start + i) % options.length]
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
  }
  const fallback = options[start]
  used.add(fallback)
  return fallback
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
  const variationSeed = normalizeIssueText(`${name} ${reason} ${notes} ${mode} ${workspace}`)
  const usedPhrases = new Set()

  if (mode === 'recognition') {
    const metricIntel =
      useMobileExpertContext && isWirelessSalesPerformanceTopic(payload)
        ? evaluateOslMetricIntelligence(`${payload?.coachingReason ?? ''} ${payload?.notes ?? ''}`, 'recognition')
        : { metrics: {}, combinedInsight: null }
    const wins = [
      metricIntel.metrics.aps?.status === 'on_track'
        ? `APS ${metricIntel.metrics.aps.value} is on track, with strong customer engagement and opportunity creation from traffic`
        : '',
      metricIntel.metrics.hpa?.status === 'on_track'
        ? `HPA ${metricIntel.metrics.hpa.value} is on track (goal <= 6.0), showing strong postpaid output for hours worked`
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
    const followUp = pickVariant(
      [
        'Will continue to encourage this behavior and check in on how things are going.',
        'Will call this out again on the next shift and reinforce the same habits.',
        'Will follow up with positive feedback this week to keep momentum up.',
      ],
      `${variationSeed}:recognition:follow`,
      usedPhrases,
    )
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
      const behavior = pickVariant(
        [
          'What was reported needs to align with required procedures—no extra assumptions beyond what was stated.',
          'This needs tighter policy execution right away with no shortcuts on key/security handling.',
          'Going forward, follow the exact security steps we reviewed so this does not repeat.',
        ],
        `${variationSeed}:compliance:behavior`,
        usedPhrases,
      )
      const impact = pickVariant(
        [
          'Gaps in policy and security expectations need to be taken seriously and corrected.',
          'Security misses increase risk for the team and create avoidable operational issues.',
          'When procedures are skipped, accountability and trust break down quickly on shift.',
        ],
        `${variationSeed}:compliance:impact`,
        usedPhrases,
      )
      const nextSteps = `• Review and follow the relevant policy steps that apply to this situation\n• Ask your manager if anything is unclear\n• Confirm key/security checks before ending each shift`
      const followUp = pickVariant(
        [
          'Follow up on the next visit to confirm the issue is addressed and standards are met.',
          'Re-check this in the next few shifts to verify policy consistency.',
          'Review progress in 3-5 days to confirm secure handling is back on track.',
        ],
        `${variationSeed}:compliance:follow`,
        usedPhrases,
      )
      return joinSections(pre, category, situation, behavior, impact, nextSteps, followUp)
    }
    case 'attendance': {
      const pre = `${name} — ${reason}${notesBit}`
      const category = `Attendance / Punctuality — ${issueRef}.`
      const situation = `${name}, the concern is: ${reason}.`
      const behavior = pickVariant(
        [
          'Timeliness and reliability need to match team expectations.',
          'The expectation is consistent on-time starts and clean return times from breaks.',
          'Going forward, attendance needs to be predictable so the team can plan around you.',
        ],
        `${variationSeed}:attendance:behavior`,
        usedPhrases,
      )
      const impact = pickVariant(
        [
          'Attendance issues affect coverage and trust with the team.',
          'Late arrivals put pressure on coverage and force others to absorb the gap.',
          'Schedule misses disrupt handoffs and lower team reliability on shift.',
        ],
        `${variationSeed}:attendance:impact`,
        usedPhrases,
      )
      const nextSteps = `• Arrive and return from breaks on time as scheduled\n• Communicate early if a conflict comes up\n• Confirm shift readiness at start of day`
      const followUp = pickVariant(
        [
          'Follow up next shift to confirm attendance expectations are being met.',
          'Check back in 3-5 days to verify on-time consistency.',
          'Review attendance trend at the next schedule checkpoint.',
        ],
        `${variationSeed}:attendance:follow`,
        usedPhrases,
      )
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

      const sourceText = `${payload?.coachingReason ?? ''} ${payload?.notes ?? ''}`
      const apsOnly =
        useMobileExpertContext &&
        !metricIntel.metrics.hpa &&
        !metricIntel.metrics.mpt &&
        (metricIntel.metrics.aps?.status === 'needs_coaching' ||
          (/\blow\s+aps\b/i.test(sourceText) && !metricIntel.metrics.hpa && !metricIntel.metrics.mpt))

      const category =
        useMobileExpertContext && metricRows.length > 0
          ? apsOnly
            ? 'Customer Engagement & Opportunity Creation.'
            : `Performance / Wireless Metrics — ${metricRows.join('; ')}.`
          : `Performance — ${issueRef}.`

      const situation = apsOnly
        ? buildApsOnlyOperationalSections(payload, name).situation
        : useMobileExpertContext && metricRows.length > 0
          ? `${name}, current metrics show: ${metricRows.join('; ')}.`
          : `${name}, the focus is: ${reason}.`

      let behavior = pickVariant(
        [
          'Execution needs to line up with what was described—stay specific to that topic.',
          'We need tighter execution on this exact metric area, not a broad reset.',
          'Focus on the specific performance gap discussed so progress is measurable this week.',
        ],
        `${variationSeed}:performance:behavior`,
        usedPhrases,
      )
      if (useMobileExpertContext && metricIntel.combinedInsight) {
        behavior = `${metricIntel.combinedInsight.diagnosis} Focus on ${metricIntel.combinedInsight.coachingFocus.join(' and ')}.`
      } else if (useMobileExpertContext && metricRows.length > 0) {
        const focus = []
        if (metricIntel.metrics.aps?.status === 'needs_coaching') {
          focus.push(
            'engaging more customers, slowing down to uncover needs, and fully working upgrade and new-line paths before moving on',
          )
        }
        if (metricIntel.metrics.hpa?.status === 'needs_coaching') {
          focus.push(
            'creating more postpaid opportunities for hours worked through proactive engagement, carrier presentations, and stronger traffic conversion',
          )
        }
        if (metricIntel.metrics.mpt?.status === 'needs_coaching') {
          focus.push('speeding up activation process flow')
        }
        if (focus.length > 0) {
          behavior = `Coaching focus: ${focus.join(', ')}.`
        }
      }
      if (useMobileExpertContext && metricRows.length > 0 && metricIntel.trend) {
        if (metricIntel.trend.classification === 'improving_but_below_goal') {
          behavior = `Trend is moving the right direction but still below goal. Keep momentum by ${metricIntel.trend.actionPlanFocus[0].toLowerCase()}.`
        } else if (metricIntel.trend.classification === 'declining_performance') {
          behavior = `Trend is declining, so urgency needs to increase now. Focus on ${metricIntel.trend.actionPlanFocus[0].toLowerCase()}.`
        } else if (metricIntel.trend.classification === 'repeated_issue') {
          behavior = `This has repeated across coaching touchpoints. We need firmer accountability and consistent execution: ${metricIntel.trend.actionPlanFocus[0].toLowerCase()}.`
        } else if (metricIntel.trend.classification === 'recovered_performance') {
          behavior = `Performance has recovered. Reinforce the habits that fixed the gap: ${metricIntel.trend.actionPlanFocus[0].toLowerCase()}.`
        }
      }
      const impact =
        workspace === 'general_workplace'
          ? pickVariant(
              [
                'When expectations slip on what we track, it affects team results and trust.',
                'Performance gaps here create downstream pressure for the rest of the team.',
                'If this trend continues, consistency and output both take a hit.',
              ],
              `${variationSeed}:performance:impact:workplace`,
              usedPhrases,
            )
          : pickVariant(
              [
                'When execution slips on what we track, it affects results the team is responsible for.',
                'This gap slows shift momentum and limits activation/conversion opportunity.',
                'If we do not tighten this, floor productivity and customer flow will keep lagging.',
              ],
              `${variationSeed}:performance:impact:wireless`,
              usedPhrases,
            )
      let nextSteps = `• Address the specific gap described above\n• Ask for clarification on expectations if needed\n• Manager check-in to review progress`
      if (useMobileExpertContext && metricIntel.combinedInsight) {
        const trendWindow = metricIntel.trend?.followUpDays || '3-7 days'
        const strategy = metricIntel.trend?.actionPlanFocus || []
        nextSteps = [
          `• 7-day plan: ${metricIntel.combinedInsight.coachingFocus[0]}`,
          `• 7-day plan: ${strategy[0] || metricIntel.combinedInsight.coachingFocus[1]}`,
          `• 7-day plan: Engage traffic early instead of waiting for customers to approach`,
          `• 7-day plan: Build more postpaid conversations through stronger discovery questions`,
          `• Track APS/HPA/MPT trend and review with Team Lead in ${trendWindow}`,
        ].join('\n')
      } else if (useMobileExpertContext && metricRows.length > 0) {
        /** @type {string[]} */
        const bullets = []
        if (metricIntel.metrics.aps?.status === 'needs_coaching') {
          bullets.push(APS_NEXT_STEPS_BULLETS[0])
        }
        if (metricIntel.metrics.hpa?.status === 'needs_coaching') {
          bullets.push(
            'Engage traffic earlier, present carrier options consistently, and build more postpaid conversations',
          )
        }
        if (metricIntel.metrics.mpt?.status === 'needs_coaching') {
          bullets.push('Reset within 5 minutes after each transaction and prep the next activation step earlier')
        }
        if (bullets.length > 0) {
          const strategy = metricIntel.trend?.actionPlanFocus || []
          for (const s of strategy) {
            if (bullets.length >= 5) break
            bullets.push(s)
          }
          while (bullets.length < 5) {
            bullets.push('Engage more customers during traffic periods')
          }
          if (bullets.length > 5) bullets.length = 5
          nextSteps = bullets.map((b) => `• ${b}`).join('\n')
        }
      }
      const followUp = pickVariant(
        [
          'Quick metric follow-up in 3-7 days to review trend progress and adjust focus.',
          'Recheck trend in 5 days and recalibrate the plan based on the latest numbers.',
          'Set a mid-week checkpoint to confirm movement before the next formal review.',
        ],
        `${variationSeed}:performance:follow`,
        usedPhrases,
      )
      const followUpFinal = followUp

      if (apsOnly) {
        const ops = buildApsOnlyOperationalSections(payload, name)
        return joinSections(
          pre,
          ops.category,
          ops.situation,
          ops.behavior,
          ops.impact,
          ops.nextSteps,
          ops.followUp ?? followUpFinal,
        )
      }

      return joinSections(pre, category, situation, behavior, impact, nextSteps, followUpFinal)
    }
    default: {
      const pre = `${name} — ${reason}${notesBit}`
      const category = `Coaching — ${issueRef}.`
      const situation = pickVariant(
        [
          `${name}, we need to address: ${reason}.`,
          `${name}, this coaching is focused on: ${reason}.`,
          `${name}, the issue we are addressing today is: ${reason}.`,
        ],
        `${variationSeed}:default:situation`,
        usedPhrases,
      )
      const behavior = pickVariant(
        [
          'The behavior needs to shift in a measurable way over the next few shifts.',
          'Going forward, execution on this area needs to be more consistent and visible.',
          'The expectation is clearer follow-through on this issue, starting immediately.',
        ],
        `${variationSeed}:default:behavior`,
        usedPhrases,
      )
      const impact = pickVariant(
        [
          'If this stays unresolved, team reliability and output can drop.',
          'This impacts day-to-day floor execution and puts extra pressure on teammates.',
          'Uncorrected, this issue creates avoidable friction in team performance.',
        ],
        `${variationSeed}:default:impact`,
        usedPhrases,
      )
      const nextSteps = pickVariant(
        [
          '• Complete the agreed action before end of shift\n• Give your lead a progress update\n• Check in again within 3-5 days',
          '• Apply the agreed correction on your next shift\n• Flag blockers early instead of waiting\n• Review progress with your lead this week',
          '• Execute the specific fix we discussed\n• Confirm completion with your lead\n• Revisit outcome at the next check-in',
        ],
        `${variationSeed}:default:next`,
        usedPhrases,
      )
      const followUp = pickVariant(
        [
          'Follow up in 3-5 days to confirm progress and close the loop.',
          'Revisit this later in the week to verify consistent improvement.',
          'Check progress at the next manager touchpoint and adjust if needed.',
        ],
        `${variationSeed}:default:follow`,
        usedPhrases,
      )
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
  return normalizeFrontlineVocabulary(
    [
    `Pre-Coaching Notes:\n${pre}\n`,
    `Coaching Category:\n${category}\n`,
    `Situation:\n${situation}\n`,
    `Behavior:\n${behavior}\n`,
    `Impact:\n${impact}\n`,
    `Next Steps:\n${next}\n`,
    `Manager Follow-Up:\n${follow}\n`,
    ].join('\n'),
  )
}
