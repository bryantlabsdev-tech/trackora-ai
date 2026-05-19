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
      'Activity and customer engagement volume (Attempts Per Shift). Higher is better.',
    needsFocus: [
      'Get off the counter and increase floor presence',
      'Create more customer attempts and eligibility checks',
      'Ask discovery questions with every electronics customer',
      'Work action alley/electronics traffic with urgency',
      'Track attempts daily and push pace in slow periods',
    ],
    onTrackFocus: [
      'Keep customers moving to the tablet consistently',
      'Protect floor activity pace through peak traffic windows',
    ],
    recognitionWins: [
      'Strong activity level and customer engagement volume',
      'Consistent tablet attempts and floor presence',
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
      'Activation productivity and conversion efficiency (Hours Per Activation). Lower is better.',
    needsFocus: [
      'Reduce time between activations with stronger urgency',
      'Use tighter discovery questions and qualify sooner',
      'Turn more postpaid conversations into activations',
      'Cut dead time between customer engagements',
      'Maximize peak traffic windows for conversion output',
    ],
    onTrackFocus: [
      'Keep discovery-to-close execution consistent',
      'Maintain efficient conversion pace during rushes',
    ],
    recognitionWins: [
      'Efficient activation productivity and conversion rhythm',
      'Strong conversion pace across the shift',
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
      'Transaction speed and activation process efficiency (Minutes Per Transaction). Lower is better.',
    needsFocus: [
      'Tighten activation flow and reduce step-to-step gaps',
      'Build system confidence and prepare next steps earlier',
      'Pre-stage accessories/devices before activation steps',
      'Reset quickly between customers so one sale does not stall the shift',
    ],
    onTrackFocus: [
      'Keep activation flow tight and repeatable',
      'Maintain fast reset between customer transactions',
    ],
    recognitionWins: [
      'Strong transaction flow and process speed',
      'Fast resets that protect customer volume',
    ],
  },
}

const METRIC_KEYS = /** @type {const} */ (['aps', 'hpa', 'mpt'])

/**
 * @param {string} text
 * @param {'aps' | 'hpa' | 'mpt'} key
 * @returns {number | null}
 */
function parseMetricValue(text, key) {
  const upper = key.toUpperCase()
  const leftPattern = new RegExp(
    `\\b${upper}\\b\\s*(?:[:=]|is|at|was|of)?\\s*(-?\\d+(?:\\.\\d+)?)`,
    'i',
  )
  const rightPattern = new RegExp(`(-?\\d+(?:\\.\\d+)?)\\s*${upper}\\b`, 'i')

  const left = text.match(leftPattern)
  const right = text.match(rightPattern)
  const raw = left?.[1] ?? right?.[1]
  if (!raw) return null
  const num = Number(raw)
  return Number.isFinite(num) ? num : null
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
 *   }>>
 *   combinedInsight: null | {
 *     label: string
 *     diagnosis: string
 *     coachingFocus: string[]
 *   }
 * }}
 */
export function evaluateOslMetricIntelligence(text, mode = 'coaching') {
  const normalized = String(text ?? '')
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
    const value = parseMetricValue(normalized, key)
    if (value == null) continue
    const spec = METRIC_SPECS[key]
    const onTrack = spec.onTrack(value)
    metrics[key] = {
      key,
      label: spec.label,
      value,
      goalText: spec.goalText,
      goalValue: spec.goalValue,
      status: onTrack ? 'on_track' : 'needs_coaching',
      severityLabel: spec.severityFor(value),
      interpretation: spec.interpretation,
      coachingFocus: onTrack ? spec.onTrackFocus : spec.needsFocus,
      recognitionWins: spec.recognitionWins,
    }
  }

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
        'Increase attempts by re-entering floor traffic faster after each sale',
      ],
    }
  } else if (aps && hpa && aps.status === 'needs_coaching' && hpa.status === 'needs_coaching') {
    combinedInsight = {
      label: 'Low APS + High HPA',
      diagnosis: 'Rep is not creating enough opportunities and productivity is low.',
      coachingFocus: [
        'Increase engagement volume and proactive customer approaches',
        'Improve discovery quality and conversion urgency',
      ],
    }
  } else if (aps && hpa && aps.status === 'on_track' && hpa.status === 'needs_coaching') {
    combinedInsight = {
      label: 'High APS + High HPA',
      diagnosis: 'Rep is making attempts but not converting efficiently.',
      coachingFocus: [
        'Strengthen discovery and qualification',
        'Coach objection handling and closing consistency',
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
        'Increase attempts while preserving conversion quality',
        'Raise floor activity and approach consistency',
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
        'Overall productivity is solid, but transaction process speed is slowing flow and should be tightened.',
      coachingFocus: [
        'Tighten process flow and prep so transactions move faster',
        'Keep strong activity/conversion rhythm while improving speed',
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

  return { metrics, combinedInsight }
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
  ]

  if (mode === 'coaching') {
    lines.push(
      '- Use real wireless floor language when relevant: get customers to the tablet, eligibility checks, customer attempts, action alley, electronics traffic, discovery questions, postpaid conversations, accessory attachment, activation flow, reset quickly between customers, peak traffic windows.',
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
      '- Section quality requirements: Situation must include metric + actual + goal + plain meaning; Behavior explains what rep is doing/not doing; Impact ties to conversion/activations/customer flow; Next Steps must be measurable; Manager Follow-Up should be 3-7 days.',
    )
    lines.push(
      '- Next Steps must include a realistic 7-day action plan with measurable bullets (examples: minimum APS target, tablet-attempt count, discovery every electronics customer, action alley focus in peak windows, eligibility tracking, activation-flow review, objection-handling practice, reset-within-5-minutes standard).',
    )
  } else {
    lines.push(
      '- Recognition mode: keep it positive and specific to metric strengths, with motivational but realistic language.',
    )
  }

  return lines.join('\n')
}
