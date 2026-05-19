/**
 * OSL/Walmart wireless metric intelligence for APS, HPA, and MPT.
 * - APS: higher is better (goal >= 3.5)
 * - HPA: lower is better (goal <= 6.0)
 * - MPT: lower is better (goal <= 45)
 */

const METRIC_SPECS = {
  aps: {
    key: 'aps',
    label: 'APS',
    goalText: '3.5 or higher',
    goalValue: 3.5,
    onTrack: (n) => n >= 3.5,
    interpretation:
      'Activity and customer-engagement volume (Attempts Per Shift). Higher is better.',
    needsFocus: [
      'Increase customer approaches and floor presence',
      'Use open-ended discovery questions earlier',
      'Create more eligibility-check attempts with urgency',
      'Raise engagement volume across the shift',
    ],
    onTrackFocus: [
      'Maintain customer-approach consistency',
      'Protect engagement pace through peak traffic',
    ],
  },
  hpa: {
    key: 'hpa',
    label: 'HPA',
    goalText: '6.0 or lower',
    goalValue: 6.0,
    onTrack: (n) => n <= 6.0,
    interpretation:
      'Activation productivity and conversion efficiency (Hours Per Activation). Lower is better.',
    needsFocus: [
      'Improve discovery quality to qualify faster',
      'Tighten conversion urgency and close consistency',
      'Reduce downtime between customer opportunities',
      'Maximize peak-traffic productivity',
    ],
    onTrackFocus: [
      'Maintain conversion rhythm during traffic swings',
      'Keep discovery-to-close flow efficient',
    ],
  },
  mpt: {
    key: 'mpt',
    label: 'MPT',
    goalText: '45 or lower',
    goalValue: 45,
    onTrack: (n) => n <= 45,
    interpretation:
      'Transaction speed and process efficiency (Minutes Per Transaction). Lower is better.',
    needsFocus: [
      'Speed up transaction process flow end-to-end',
      'Build system confidence for faster execution',
      'Prepare offers and required steps before activation',
      'Cut wasted time during activations',
    ],
    onTrackFocus: [
      'Keep transaction flow clean and repeatable',
      'Maintain preparation habits that protect speed',
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
 * @returns {{
 *   metrics: Partial<Record<'aps' | 'hpa' | 'mpt', {
 *     key: 'aps' | 'hpa' | 'mpt'
 *     label: string
 *     value: number
 *     goalText: string
 *     goalValue: number
 *     status: 'on_track' | 'needs_coaching'
 *     interpretation: string
 *     coachingFocus: string[]
 *   }>>
 *   combinedInsight: null | {
 *     label: string
 *     diagnosis: string
 *     coachingFocus: string[]
 *   }
 * }}
 */
export function evaluateOslMetricIntelligence(text) {
  const normalized = String(text ?? '')
  /** @type {Partial<Record<'aps' | 'hpa' | 'mpt', {
   *   key: 'aps' | 'hpa' | 'mpt'
   *   label: string
   *   value: number
   *   goalText: string
   *   goalValue: number
   *   status: 'on_track' | 'needs_coaching'
   *   interpretation: string
   *   coachingFocus: string[]
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
      interpretation: spec.interpretation,
      coachingFocus: onTrack ? spec.onTrackFocus : spec.needsFocus,
    }
  }

  const aps = metrics.aps
  const hpa = metrics.hpa
  const mpt = metrics.mpt
  let combinedInsight = null

  if (aps && hpa && aps.status === 'needs_coaching' && hpa.status === 'needs_coaching') {
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
  }

  return { metrics, combinedInsight }
}

/**
 * Builds a concise, model-ready context block from parsed metrics.
 * Returns empty string when no APS/HPA/MPT values were provided.
 * @param {string} text
 * @returns {string}
 */
export function buildOslMetricPromptContext(text) {
  const intel = evaluateOslMetricIntelligence(text)
  const present = METRIC_KEYS.filter((k) => intel.metrics[k])
  if (present.length === 0) return ''

  const lines = [
    'OSL METRIC INTELLIGENCE (derived from user input numbers; apply exactly):',
    '- APS goal: >= 3.5 (higher is better)',
    '- HPA goal: <= 6.0 (lower is better)',
    '- MPT goal: <= 45 (lower is better)',
  ]

  for (const key of present) {
    const m = intel.metrics[key]
    if (!m) continue
    lines.push(
      `- ${m.label}: ${m.value} vs goal ${m.goalText} -> ${
        m.status === 'on_track' ? 'On Track' : 'Needs Coaching'
      }`,
    )
    lines.push(`  - Meaning: ${m.interpretation}`)
    lines.push(`  - Coaching focus: ${m.coachingFocus.slice(0, 3).join('; ')}`)
  }

  if (intel.combinedInsight) {
    lines.push(
      `- Combined metric signal (${intel.combinedInsight.label}): ${intel.combinedInsight.diagnosis}`,
    )
    lines.push(`  - Combined coaching focus: ${intel.combinedInsight.coachingFocus.join('; ')}`)
  }

  lines.push(
    '- Use these metric directions exactly (especially HPA lower-is-better) and tie coaching directly to the measured result.',
  )

  return lines.join('\n')
}
