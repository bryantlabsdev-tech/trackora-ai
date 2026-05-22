
const METRIC_SPECS = {
  aps: {
    key: 'aps',
    label: 'APS',
    goalText: '3.5 or higher',
    goalValue: 3.5,
    onTrack: (n) => n >= 3.5,
    severityFor: (n) => {
      if (n >= 3.5) return 'On Track'
      if (n >= 3.0) return 'Slightly Below Goal'
      if (n >= 2.0) return 'Needs Improvement'
      return 'Critical Activity Concern'
    },
    interpretation:
      'Customer engagement and opportunity creation on the floor — more fully worked interactions means more upgrades, new lines, and activation opportunities from traffic.',
    needsFocus: [
      'Engage more customers throughout the day',
      'Slow down conversations to uncover customer needs',
      'Explore upgrade and new-line opportunities consistently',
      'Fully work each customer interaction before moving on',
      'Create more activation opportunities from store traffic',
    ],
    onTrackFocus: [
      'Keep engaging customers and fully working conversations before moving on',
      'Protect opportunity discovery through peak windows without rushing interactions',
    ],
    recognitionWins: [
      'Strong opportunity-creation volume and consistent traffic engagement',
      'Consistent traffic engagement and upgrade/new-line exploration',
    ],
  },
  hpa: {
    key: 'hpa',
    label: 'HPA',
    goalText: '6.0 or lower',
    goalValue: 6.0,
    onTrack: (n) => n <= 6.0,
    severityFor: (n) => {
      if (n <= 6.0) return 'On Track'
      if (n <= 7.0) return 'Slightly Above Goal'
      if (n <= 9.0) return 'Needs Improvement'
      return 'Critical Efficiency Concern'
    },
    interpretation:
      'Postpaid production and conversion efficiency (Hours Per Activation). Lower is better.',
    needsFocus: [
      'Increase activations produced for hours worked by creating more opportunities',
      'Create more postpaid opportunities throughout the shift',
      'Use stronger discovery questions to uncover upgrade/port/new line opportunities',
      'Present postpaid and carrier options consistently instead of waiting for customers to ask',
      'Drive urgency and proactive engagement during peak traffic windows',
      'Turn more customer conversations into postpaid opportunities',
    ],
    onTrackFocus: [
      'Keep strong activations-per-hours-worked output through consistent opportunity creation',
      'Keep converting customer traffic into postpaid opportunities during peak traffic windows',
    ],
    recognitionWins: [
      'Strong activations-per-hours-worked production efficiency',
      'Consistent customer engagement turning into postpaid opportunities',
    ],
  },
  mpt: {
    key: 'mpt',
    label: 'MPT',
    goalText: '45 or lower',
    goalValue: 45,
    onTrack: (n) => n <= 45,
    severityFor: (n) => {
      if (n <= 45) return 'On Track'
      if (n <= 55) return 'Slightly Above Goal'
      if (n <= 70) return 'Needs Improvement'
      return 'Critical Transaction Speed Concern'
    },
    interpretation:
      'Transaction speed and floor execution pace (Minutes Per Transaction). Lower is better.',
    needsFocus: [
      'Tighten transaction pace and reduce step-to-step gaps',
      'Build system confidence and prepare next steps earlier',
      'Pre-stage accessories/devices before activation steps',
      'Reset quickly between customers so one sale does not stall the shift',
    ],
    onTrackFocus: [
      'Keep transaction pace tight and repeatable',
      'Maintain fast reset between customer transactions',
    ],
    recognitionWins: [
      'Strong transaction flow and process speed',
      'Fast resets that protect customer volume',
    ],
  },
}

const METRIC_KEYS = /** @type {const} */ (['aps', 'hpa', 'mpt'])
const REPEATED_ISSUE_PATTERNS = [
  /\bagain\b/i,
  /\bstill\b/i,
  /\brepeated\b/i,
  /\bsame issue\b/i,
  /\bongoing\b/i,
  /\bnot improving\b/i,
  /\bprevious coaching\b/i,
  /\bfollow[-\s]?up\b/i,
]
const BEHAVIOR_STRATEGY_PATTERNS = {
  passiveness: [/\bwait(?:ing)? behind the counter\b/i, /\bpassive\b/i, /\bnot approaching\b/i],
  urgency: [/\bno urgency\b/i, /\bslow pace\b/i, /\bdead time\b/i, /\blong gaps?\b/i],
  timing: [/\bpeak traffic\b/i, /\baction alley\b/i, /\belectronics traffic\b/i],
  confidence: [/\bconfidence\b/i, /\bhesitant\b/i, /\bunsure\b/i, /\bsystem confidence\b/i],
  transitions: [/\bprepaid to postpaid\b/i, /\btransition\b/i, /\bhandoff\b/i],
  conversion: [/\bconversion\b/i, /\bnot closing\b/i, /\bobjection\b/i, /\bqualification\b/i],
  flow: [/\bflow\b/i, /\bmpt\b/i, /\bactivation process\b/i, /\breset\b/i],
}
const OPERATIONAL_SPEED_PATTERNS = [
  /\bslow transactions?\b/i,
  /\bslow setup\b/i,
  /\bpaperwork delays?\b/i,
  /\blong customer wait times?\b/i,
  /\bslow operational execution\b/i,
]

/**
 * @param {string} text
 * @param {'aps' | 'hpa' | 'mpt'} key
 * @returns {number | null}
 */
function parseMetricSeries(text, key) {
  const upper = key.toUpperCase()
  const leftPattern = new RegExp(
    `\\b${upper}\\b\\s*(?:[:=]|is|at|was|of)?\\s*(-?\\d+(?:\\.\\d+)?)`,
    'ig',
  )
  const rightPattern = new RegExp(`(-?\\d+(?:\\.\\d+)?)\\s*${upper}\\b`, 'ig')

  /** @type {number[]} */
  const values = []
  for (const m of text.matchAll(leftPattern)) {
    const n = Number(m[1])
    if (Number.isFinite(n)) values.push(n)
  }
  if (values.length === 0) {
    for (const m of text.matchAll(rightPattern)) {
      const n = Number(m[1])
      if (Number.isFinite(n)) values.push(n)
    }
  }
  return values
}

/**
 * @param {string} text
 */
function detectBehaviorStrategies(text) {
  const strategies = []
  const t = String(text ?? '')
  const has = (arr) => arr.some((re) => re.test(t))
  if (has(BEHAVIOR_STRATEGY_PATTERNS.passiveness)) {
    strategies.push('Coach proactive floor behavior: do not wait behind the counter, open more customer attempts early')
  }
  if (has(BEHAVIOR_STRATEGY_PATTERNS.urgency)) {
    strategies.push('Coach urgency habits: reduce dead time, reset faster, and re-enter traffic immediately after each interaction')
  }
  if (has(BEHAVIOR_STRATEGY_PATTERNS.timing)) {
    strategies.push('Coach timing execution: prioritize action alley/electronics traffic during peak windows')
  }
  if (has(BEHAVIOR_STRATEGY_PATTERNS.confidence)) {
    strategies.push('Coach confidence reps: rehearse discovery and system navigation before shift start')
  }
  if (has(BEHAVIOR_STRATEGY_PATTERNS.transitions)) {
    strategies.push('Coach transition habits: improve prepaid-to-postpaid transition language and handoff control')
  }
  if (has(BEHAVIOR_STRATEGY_PATTERNS.conversion)) {
    strategies.push(
      'Coach traffic conversion: ask stronger discovery questions, handle objections earlier, and present carrier options with urgency',
    )
  }
  if (has(BEHAVIOR_STRATEGY_PATTERNS.flow)) {
    strategies.push('Coach operational pace: tighten transaction steps and remove idle gaps between steps')
  }
  if (strategies.length === 0) {
    strategies.push('Coach engagement timing and floor presence based on actual traffic opportunities')
    strategies.push(
      'Coach traffic conversion using stronger discovery, cleaner carrier presentations, and faster next-step urgency',
    )
  }
  return strategies
}

/**
 * @param {string} text
 */
function hasOperationalSpeedSignal(text) {
  const t = String(text ?? '')
  return OPERATIONAL_SPEED_PATTERNS.some((re) => re.test(t))
}

/**
 * @param {string} text
 * @param {Partial<Record<'aps'|'hpa'|'mpt', { key: 'aps'|'hpa'|'mpt'; value:number; status:'on_track'|'needs_coaching'; previousValue:number|null; trendDirection:'improving'|'declining'|'stagnant'|'first_observed' }>>} metrics
 */
function buildTrendIntelligence(text, metrics) {
  const present = METRIC_KEYS.filter((k) => metrics[k])
  if (present.length === 0) {
    return {
      classification: 'first_time',
      summary: 'No metric trend evidence yet. Treat as first documented metric conversation.',
      tone: 'balanced',
      urgency: 'normal',
      followUpDays: '5-7 days',
      actionPlanFocus: detectBehaviorStrategies(text),
      repeatedIssue: false,
    }
  }

  const repeatedIssue = REPEATED_ISSUE_PATTERNS.some((re) => re.test(String(text ?? '')))
  const hasDeclining = present.some((k) => metrics[k]?.trendDirection === 'declining')
  const hasImproving = present.some((k) => metrics[k]?.trendDirection === 'improving')
  const hasStagnant = present.some((k) => metrics[k]?.trendDirection === 'stagnant')
  const allFirstObserved = present.every((k) => metrics[k]?.trendDirection === 'first_observed')
  const recovered = present.some((k) => {
    const m = metrics[k]
    if (!m || m.previousValue == null) return false
    const spec = METRIC_SPECS[k]
    return !spec.onTrack(m.previousValue) && m.status === 'on_track'
  })
  const improvingButBelow = present.some((k) => {
    const m = metrics[k]
    return m?.trendDirection === 'improving' && m.status === 'needs_coaching'
  })

  let classification = 'stagnant_performance'
  let summary = 'Performance trend is mostly flat; adjust behavior intensity and execution quality.'
  let tone = 'direct'
  let urgency = 'normal'
  let followUpDays = '5 days'

  if (recovered) {
    classification = 'recovered_performance'
    summary = 'Recovered performance: trend moved back to on-track. Reinforce repeatable habits and protect momentum.'
    tone = 'supportive'
    urgency = 'low'
    followUpDays = '7-10 days'
  } else if (hasDeclining) {
    classification = 'declining_performance'
    summary = 'Declining performance trend: urgency should increase with clear accountability checkpoints.'
    tone = 'firm'
    urgency = 'high'
    followUpDays = '3 days'
  } else if (repeatedIssue) {
    classification = 'repeated_issue'
    summary = 'Repeated issue pattern: keep coaching firm with explicit accountability and evidence checks.'
    tone = 'firm'
    urgency = 'high'
    followUpDays = '3-5 days'
  } else if (improvingButBelow) {
    classification = 'improving_but_below_goal'
    summary = 'Trend is improving but still below goal: supportive tone with momentum-focused plan.'
    tone = 'supportive'
    urgency = 'moderate'
    followUpDays = '5 days'
  } else if (allFirstObserved) {
    classification = 'first_time'
    summary = 'First-time coaching on this metric set: set baseline, expectations, and measurable next actions.'
    tone = 'balanced'
    urgency = 'normal'
    followUpDays = '5-7 days'
  } else if (hasStagnant) {
    classification = 'stagnant_performance'
    summary = 'Stagnant trend with limited movement: adjust strategy and tighten execution behaviors.'
    tone = 'direct'
    urgency = 'moderate'
    followUpDays = '4-5 days'
  } else if (hasImproving) {
    classification = 'improving_performance'
    summary = 'Performance is improving: reinforce working behaviors and keep consistency pressure.',
    tone = 'supportive'
    urgency = 'moderate'
    followUpDays = '5-7 days'
  }

  return {
    classification,
    summary,
    tone,
    urgency,
    followUpDays,
    actionPlanFocus: detectBehaviorStrategies(text),
    repeatedIssue,
  }
}

/**
 * @param {string} text
 * @param {'coaching' | 'recognition'} mode
 * @returns {{
 *   metrics: Partial<Record<'aps' | 'hpa' | 'mpt', {
 *     key: 'aps' | 'hpa' | 'mpt'
 *     label: string
 *     value: number
 *     goalText: string
 *     goalValue: number
 *     status: 'on_track' | 'needs_coaching'
 *     severityLabel: string
 *     interpretation: string
 *     coachingFocus: string[]
 *     recognitionWins: string[]
 *     previousValue: number | null
 *     trendDirection: 'improving' | 'declining' | 'stagnant' | 'first_observed'
 *   }>>
 *   trend: {
 *     classification: string
 *     summary: string
 *     tone: string
 *     urgency: string
 *     followUpDays: string
 *     actionPlanFocus: string[]
 *     repeatedIssue: boolean
 *   }
 *   combinedInsight: null | {
 *     label: string
 *     diagnosis: string
 *     coachingFocus: string[]
 *   }
 * }}
 */
export function evaluateOslMetricIntelligence(text, mode = 'coaching') {
  const normalized = String(text ?? '')
  const explicitOperationalSpeedSignal = hasOperationalSpeedSignal(normalized)
  /** @type {Partial<Record<'aps' | 'hpa' | 'mpt', {
   *   key: 'aps' | 'hpa' | 'mpt'
   *   label: string
   *   value: number
   *   goalText: string
   *   goalValue: number
   *   status: 'on_track' | 'needs_coaching'
   *   severityLabel: string
   *   interpretation: string
   *   coachingFocus: string[]
   *   recognitionWins: string[]
   * }>>} */
  const metrics = {}

  for (const key of METRIC_KEYS) {
    const series = parseMetricSeries(normalized, key)
    if (series.length === 0) continue
    const value = series[series.length - 1]
    const previousValue = series.length >= 2 ? series[series.length - 2] : null
    const spec = METRIC_SPECS[key]
    const onTrack = spec.onTrack(value)
    let trendDirection = 'first_observed'
    if (previousValue != null) {
      const delta = value - previousValue
      const epsilon = key === 'mpt' ? 1.5 : 0.15
      if (Math.abs(delta) <= epsilon) {
        trendDirection = 'stagnant'
      } else if (key === 'aps') {
        trendDirection = delta > 0 ? 'improving' : 'declining'
      } else {
        trendDirection = delta < 0 ? 'improving' : 'declining'
      }
    }
    /** @type {string[]} */
    const coachingFocus = onTrack ? [...spec.onTrackFocus] : [...spec.needsFocus]
    if (key === 'hpa' && explicitOperationalSpeedSignal && !onTrack) {
      coachingFocus.push(
        'Address setup/paperwork/customer-wait delays only where explicitly observed in notes',
      )
    }

    metrics[key] = {
      key,
      label: spec.label,
      value,
      goalText: spec.goalText,
      goalValue: spec.goalValue,
      status: onTrack ? 'on_track' : 'needs_coaching',
      severityLabel: spec.severityFor(value),
      interpretation: spec.interpretation,
      coachingFocus,
      recognitionWins: spec.recognitionWins,
      previousValue,
      trendDirection,
    }
  }

  const trend = buildTrendIntelligence(normalized, metrics)

  const aps = metrics.aps
  const hpa = metrics.hpa
  const mpt = metrics.mpt
  let combinedInsight = null

  if (aps && mpt && aps.status === 'needs_coaching' && mpt.status === 'needs_coaching') {
    combinedInsight = {
      label: 'High MPT + Low APS',
      diagnosis: 'Transactions are taking too long and reducing total opportunity volume.',
      coachingFocus: [
        'Tighten activation speed and reset quickly between customers',
        'Get back into traffic faster after each sale to work more opportunities',
      ],
    }
  } else if (aps && hpa && aps.status === 'needs_coaching' && hpa.status === 'needs_coaching') {
    combinedInsight = {
      label: 'Low APS + High HPA',
      diagnosis:
        'Rep is not creating enough opportunities, and postpaid output pace is below target for hours worked.',
      coachingFocus: [
        'Work all carrier options across traffic and engage more customers consistently',
        'Uncover upgrade and new-line paths with stronger discovery before moving on',
      ],
    }
  } else if (aps && hpa && aps.status === 'on_track' && hpa.status === 'needs_coaching') {
    combinedInsight = {
      label: 'High APS + High HPA',
      diagnosis:
        'Rep is getting attempts but not turning enough customer conversations into postpaid opportunities.',
      coachingFocus: [
        'Strengthen discovery and opportunity finding',
        'Tighten objection handling and consistent postpaid presentations',
      ],
    }
  } else if (aps && mpt && aps.status === 'on_track' && mpt.status === 'needs_coaching') {
    combinedInsight = {
      label: 'Good APS + High MPT',
      diagnosis: 'Rep is creating opportunities but transactions are taking too long.',
      coachingFocus: [
        'Tighten process speed and system flow',
        'Improve preparation to reduce in-transaction delays',
      ],
    }
  } else if (aps && hpa && aps.status === 'needs_coaching' && hpa.status === 'on_track') {
    combinedInsight = {
      label: 'Low APS + Good HPA',
      diagnosis: 'Rep converts decently when engaged, but opportunity volume is low.',
      coachingFocus: [
        'Work all carrier options while preserving conversation quality',
        'Maximize opportunities per interaction and do not stop at the first no',
      ],
    }
  } else if (
    aps &&
    hpa &&
    mpt &&
    aps.status === 'on_track' &&
    hpa.status === 'on_track' &&
    mpt.status === 'needs_coaching'
  ) {
    combinedInsight = {
      label: 'Good APS + Good HPA + High MPT',
      diagnosis:
        'Overall output is solid, but transaction pace is slowing floor momentum and should be tightened.',
      coachingFocus: [
        'Tighten transaction flow and prep so customer handling moves faster',
        'Protect strong activity and postpaid opportunity creation while improving pace',
      ],
    }
  }

  if (mode === 'recognition' && combinedInsight && /needs|high|low/i.test(combinedInsight.label)) {
    // Recognition mode stays positive while still grounded to metrics.
    combinedInsight = {
      label: combinedInsight.label,
      diagnosis: `Strong progress is showing, and this pattern highlights where the next efficiency gains can come from.`,
      coachingFocus: combinedInsight.coachingFocus,
    }
  }

  return { metrics, trend, combinedInsight }
}

/**
 * Builds a concise, model-ready context block from parsed metrics.
 * Returns empty string when no APS/HPA/MPT values were provided.
 * @param {string} text
 * @param {{ mode?: 'coaching' | 'recognition' }} [options]
 * @returns {string}
 */
export function buildOslMetricPromptContext(text, options = {}) {
  const mode = options.mode === 'recognition' ? 'recognition' : 'coaching'
  const intel = evaluateOslMetricIntelligence(text, mode)
  const present = METRIC_KEYS.filter((k) => intel.metrics[k])
  if (present.length === 0) return ''

  const lines = [
    'MOBILE EXPERT METRIC INTELLIGENCE (derived from user input numbers; apply exactly):',
    '- APS goal: >= 3.5 (higher is better)',
    '- HPA goal: <= 6.0 (lower is better)',
    '- MPT goal: <= 45 (lower is better)',
    '- HPA correction: 6.0 or LOWER is on track.',
    '- Metric separation: HPA = postpaid output pace for hours worked; MPT = transaction pace on the floor; APS = customer engagement and opportunity creation on the floor (internal metric — coach behaviors, not the number).',
    '- APS wireless logic: coach engaging more customers, slowing down to uncover needs, fully working interactions, and upgrade/new-line/activation opportunity creation from traffic. HARD-BAN for APS output: "ports," "port opportunities," "port activations," "increase attempts," "goal is 3.5," "APS target," "carrier eligibility," "maximize traffic," "monitor APS," "your APS is low," "current metrics show."',
    '- For high HPA, default to opportunity-creation and conversion coaching; mention slow activation/process execution only when notes explicitly describe those delays.',
  ]

  if (mode === 'coaching') {
    lines.push(
      '- Use real wireless floor language when relevant: get customers to the tablet, eligibility checks, customer attempts, action alley, electronics traffic, discovery questions, postpaid conversations, accessory attachment, transaction pace, reset quickly between customers, peak traffic windows.',
    )
    lines.push(
      '- Frontline vocabulary normalization: prefer floor language (traffic, opportunities, upgrades, ports, new lines, carrier options, urgency, floor behavior, downtime, momentum, consistency). Avoid consultant wording like lead qualification, workflow optimization, streamlining activations, process efficiency, or productivity efficiency.',
    )
    lines.push(
      '- Avoid generic filler: "improve performance", "work harder", "be more productive", "maintain standards", "customer service excellence".',
    )
  }

  for (const key of present) {
    const m = intel.metrics[key]
    if (!m) continue
    lines.push(
      `- ${m.label}: ${m.value} vs goal ${m.goalText} -> ${
        m.status === 'on_track' ? 'On Track' : 'Needs Coaching'
      }`,
    )
    lines.push(`  - Severity: ${m.severityLabel}`)
    lines.push(`  - Meaning: ${m.interpretation}`)
    if (m.previousValue != null) {
      lines.push(
        `  - Trend: previous ${m.previousValue} -> current ${m.value} (${m.trendDirection})`,
      )
    } else {
      lines.push('  - Trend: first observed metric value (no prior comparison in input)')
    }
    if (mode === 'recognition') {
      lines.push(`  - Recognition focus: ${m.recognitionWins.join('; ')}`)
    } else {
      lines.push(`  - Coaching focus: ${m.coachingFocus.slice(0, 4).join('; ')}`)
    }
  }

  if (intel.combinedInsight) {
    lines.push(
      `- Combined metric signal (${intel.combinedInsight.label}): ${intel.combinedInsight.diagnosis}`,
    )
    lines.push(`  - Combined coaching focus: ${intel.combinedInsight.coachingFocus.join('; ')}`)
  }

  if (mode === 'coaching') {
    lines.push(
      `- Trend intelligence: ${intel.trend.classification} (${intel.trend.summary})`,
    )
    lines.push(
      `  - Tone guidance: ${intel.trend.tone}; urgency: ${intel.trend.urgency}; follow-up window: ${intel.trend.followUpDays}.`,
    )
    lines.push(`  - Behavior-aware strategy focus: ${intel.trend.actionPlanFocus.slice(0, 3).join('; ')}`)
    lines.push(
      '- Section quality requirements: Situation must include metric + actual + goal + plain meaning; Behavior explains what rep is doing/not doing; Impact ties to conversion/activations/customer flow; Next Steps must be measurable with 4-5 short bullets; Manager Follow-Up should be 3-7 days.',
    )
    lines.push(
      '- Next Steps must include a realistic 7-day action plan with 4-5 measurable frontline bullets (examples: engage more customers throughout the day, slow down to uncover needs, explore upgrade and new-line opportunities, fully work each interaction, create activation opportunities from traffic).',
    )
  } else {
    lines.push(
      '- Recognition mode: keep it positive and specific to metric strengths, with motivational but realistic language.',
    )
  }

  return lines.join('\n')
}
