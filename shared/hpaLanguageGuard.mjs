import { evaluateOslMetricIntelligence } from './oslMetricIntelligence.mjs'

const SPEED_SIGNAL_PATTERNS = [
  /\bslow transactions?\b/i,
  /\bslow setup\b/i,
  /\bpaperwork delays?\b/i,
  /\blong customer wait times?\b/i,
  /\bslow operational execution\b/i,
]

const HPA_FORBIDDEN_REPLACEMENTS = [
  [/\btime between activations\b/gi, 'postpaid output pace for hours worked'],
  [/\btaking too long between postpaid activations\b/gi, 'postpaid output pace is below target for hours worked'],
  [/\btaking too long between activations\b/gi, 'postpaid opportunity creation is below target for hours worked'],
  [/\breduce time between activations\b/gi, 'create more postpaid conversations throughout the shift'],
  [/\bbetween postpaid activations\b/gi, 'across hours worked'],
  [/\bimproving your conversion habits\b/gi, 'building more postpaid conversations from customer traffic'],
  [/\bconversion habits\b/gi, 'traffic conversion from customer conversations'],
  [/\btrack your activation flow\b/gi, 'track postpaid conversations and activations each shift'],
  [/\bactivation flow\b/gi, 'transaction pace on the floor'],
  [/\bclosing sales\b/gi, 'turning more customer conversations into postpaid opportunities'],
  [/\bclosing techniques\b/gi, 'confidence asking for the sale during conversations'],
  [/\bqualifying leads\b/gi, 'asking stronger discovery questions'],
  [/\bqualifying customers\b/gi, 'using discovery questions to uncover upgrades, ports, and new lines'],
  [/\blead qualification\b/gi, 'discovery and opportunity finding'],
  [/\bworkflow optimization\b/gi, 'cleaner floor execution'],
  [/\bactivation timing\b/gi, 'postpaid output pace across the shift'],
  [/\bprocess optimization\b/gi, 'cleaner floor execution'],
  [/\bworkflow\/process efficiency\b/gi, 'floor execution pace'],
  [/\bworkflow efficiency\b/gi, 'consistent floor activity and urgency'],
  [/\btransaction speed\b/gi, 'customer engagement urgency'],
  [/\bstreamlin(?:e|ing) activations?\b/gi, 'create more postpaid conversations with better urgency'],
]

const HPA_DENY_PATTERNS = [
  /\btaking too long between activations\b/i,
  /\btaking too long between postpaid activations\b/i,
  /\bactivation timing\b/i,
  /\bactivation flow\b/i,
  /\btime between activations\b/i,
  /\breduce time between activations\b/i,
  /\bworkflow\/?process efficiency\b/i,
  /\bworkflow efficiency\b/i,
  /\bstreamlin(?:e|ing) activations?\b/i,
  /\btransaction speed\b/i,
  /\bqualifying customers\b/i,
  /\bqualifying leads\b/i,
  /\bclosing techniques?\b/i,
  /\bconversion habits\b/i,
  /\bprocess optimization\b/i,
]

const HPA_NEXT_STEP_FILLERS = [
  'Engage more customers early in each part of the shift, not only during rushes',
  'Uncover more upgrades, ports, and new lines with stronger discovery questions',
  'Present postpaid options in more customer conversations throughout traffic windows',
  'Keep urgency up during slower traffic instead of waiting behind the counter',
  'Stay active on the floor and avoid passive downtime between interactions',
]

/**
 * @param {string} text
 * @returns {string}
 */
function ensureHpaNextStepsCoverage(text) {
  const nextStepsRe = /Next Steps:\s*\n([\s\S]*?)(\n+Manager Follow-Up:|$)/i
  const m = text.match(nextStepsRe)
  if (!m) return text
  const body = m[1]
  const tail = m[2]
  const bullets = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-•]\s+/.test(line))
  if (bullets.length >= 4) return text

  /** @type {string[]} */
  const merged = [...bullets]
  for (const filler of HPA_NEXT_STEP_FILLERS) {
    if (merged.length >= 5) break
    const already = merged.some((b) => b.toLowerCase().includes(filler.toLowerCase().slice(0, 18)))
    if (!already) merged.push(`• ${filler}`)
  }
  while (merged.length < 4) {
    merged.push('• Keep postpaid conversations moving throughout the shift')
  }
  const replacement = `Next Steps:\n${merged.join('\n')}${tail}`
  return text.replace(nextStepsRe, replacement)
}

/**
 * @param {string} text
 * @returns {string}
 */
function forceRemoveDeniedHpaPhrases(text) {
  let out = String(text ?? '')
  for (const deny of HPA_DENY_PATTERNS) {
    out = out.replace(deny, 'postpaid opportunity creation')
  }
  return out
}

/**
 * Guardrail for HPA coaching language:
 * - When HPA appears without explicit speed/process signals (and no high-MPT signal),
 *   scrub literal activation-speed phrasing into frontline postpaid-productivity language.
 * @param {string} text
 * @param {{ coachingReason?: string; notes?: string } | null | undefined} payload
 * @returns {string}
 */
export function applyHpaLanguageGuard(text, payload) {
  const out = String(text ?? '')
  const sourceText = `${payload?.coachingReason ?? ''} ${payload?.notes ?? ''}`.trim()
  if (!sourceText) return out

  const intel = evaluateOslMetricIntelligence(sourceText, 'coaching')
  const hasHpa = Boolean(intel.metrics?.hpa)
  if (!hasHpa) return out

  const hasExplicitSpeedSignal = SPEED_SIGNAL_PATTERNS.some((re) => re.test(sourceText))
  const hasHighMptSignal = intel.metrics?.mpt?.status === 'needs_coaching'
  if (hasExplicitSpeedSignal || hasHighMptSignal) return out

  let guarded = out
  for (const [pattern, replacement] of HPA_FORBIDDEN_REPLACEMENTS) {
    guarded = guarded.replace(pattern, replacement)
  }

  if (HPA_DENY_PATTERNS.some((re) => re.test(guarded))) {
    // One extra pass catches overlapping phrase variants after initial rewrites.
    for (const [pattern, replacement] of HPA_FORBIDDEN_REPLACEMENTS) {
      guarded = guarded.replace(pattern, replacement)
    }
  }
  if (HPA_DENY_PATTERNS.some((re) => re.test(guarded))) {
    guarded = forceRemoveDeniedHpaPhrases(guarded)
  }

  guarded = ensureHpaNextStepsCoverage(guarded)
  return guarded
}

