import { evaluateOslMetricIntelligence } from './oslMetricIntelligence.mjs'

/** Canonical 5 bullets written when APS Next Steps are fully replaced. */
export const APS_NEXT_STEPS_BULLETS = [
  'Engage more customers throughout the day',
  'Slow down conversations to uncover customer needs',
  'Explore upgrade and new-line opportunities consistently',
  'Fully work each customer interaction before moving on',
  'Ask stronger discovery questions during conversations',
]

/** Expanded APS-safe pool for auto-fill when fewer than 5 bullets are present. */
export const APS_NEXT_STEPS_FALLBACK_POOL = [
  ...APS_NEXT_STEPS_BULLETS,
  'Create more activation opportunities from store traffic',
  'Stay engaged with customers longer during interactions',
  'Focus on uncovering customer needs before ending conversations',
]

export const APS_MANAGER_FOLLOW_UP =
  "Let's check back in later this week and see how customer engagement is improving."

export const APS_CATEGORY = 'Customer Engagement & Opportunity Creation'

/**
 * @param {string} sourceText
 */
export function isApsCoachingTopic(sourceText) {
  return /\b(low\s+aps|aps\s+below|below\s+(?:the\s+)?(?:aps\s+)?goal|weak\s+(?:aps|traffic|engagement)|attempts\s+per\s+shift)\b/i.test(
    sourceText,
  )
}

export function hasApsCoachingContext(payload) {
  const sourceText = `${payload?.coachingReason ?? ''} ${payload?.notes ?? ''}`.trim()
  if (!sourceText) return false
  if (isApsCoachingTopic(sourceText)) return true
  return Boolean(evaluateOslMetricIntelligence(sourceText, 'coaching').metrics?.aps)
}

/** Hard-banned phrasing in APS coaching output (KPI-bot + ports). */
export const APS_PHRASE_BLACKLIST = [
  /\bgoal is 3\.5\b/i,
  /\bAPS target\b/i,
  /\bincrease attempts\b/i,
  /\bimprove APS\b/i,
  /\bchecking carrier eligibility\b/i,
  /\ball available carriers\b/i,
  /\bmaximize traffic\b/i,
  /\bmaximize attempts\b/i,
  /\bmonitor APS\b/i,
  /\bcustomer traffic opportunities\b/i,
  /\bincrease your attempts\b/i,
  /\bincreasing attempts\b/i,
  /\bincrease your APS\b/i,
  /\bincrease APS\b/i,
  /\bAPS goal\b/i,
  /\btarget APS\b/i,
  /\btarget 3\.5\b/i,
  /\bcarrier eligibility\b/i,
  /\bcheck eligibility\b/i,
  /\bchecking eligibility\b/i,
  /\bavailable carriers\b/i,
  /\bmonitor your APS\b/i,
  /\btrack your APS\b/i,
  /\btrack attempts\b/i,
  /\bcurrent metrics show\b/i,
  /\bvs >= 3\.5\b/i,
  /\byour APS is\b/i,
  /\bbelow where it needs to be\b/i,
  /\battempts per shift\b/i,
  /\btablet eligibility\b/i,
  /\bport opportunities\b/i,
  /\bport activations\b/i,
  /\bport paths\b/i,
  /\bupgrade, port, and new-line\b/i,
  /\bupgrade\/port\b/i,
  /\bupgrades, ports, and new lines\b/i,
  /\bupgrades, ports, new lines\b/i,
  /\b,\s*ports?\b/i,
  /\bports and new lines\b/i,
]

export const APS_IMPACT_LINES = [
  "When we don't fully work each interaction, we leave activation opportunities on the table and miss upgrades and new lines.",
  "We're missing upgrades, new lines, and activations when conversations end too early.",
]

/** @type {[RegExp, string][]} */
export const APS_PHRASE_REPLACEMENTS = [
  [/\bgoal is 3\.5[^.]*\.?/gi, ''],
  [/\bAPS target[^.]*\.?/gi, ''],
  [/\ball available carriers\b/gi, ''],
  [/\bmaximize traffic\b/gi, 'slow down and uncover more opportunities'],
  [/\bmaximize attempts\b/gi, 'fully work more customer interactions'],
  [/\bcustomer traffic opportunities\b/gi, 'more activation opportunities with customers'],
  [/\bchecking carrier eligibility\b/gi, 'fully work conversations and uncover customer needs'],
  [/\bcheck carrier eligibility\b/gi, 'fully work conversations and uncover customer needs'],
  [/\bcarrier eligibility(?: checks?)?\b/gi, ''],
  [/\bincrease attempts\b/gi, 'engage more customers and fully work each interaction'],
  [/\bincrease your attempts\b/gi, 'engage more customers and fully work each interaction'],
  [/\bimprove APS\b/gi, 'create more activation opportunities with customers'],
  [/\bmonitor APS\b/gi, 'stay engaged with customers throughout the shift'],
  [/\bmonitor your APS\b/gi, 'stay engaged with customers throughout the shift'],
  [/\bAPS goal\b/gi, ''],
  [/\btarget 3\.5[^.]*\.?/gi, ''],
  [/\btarget APS\b/gi, ''],
  [/\bcurrent metrics show:[^.\n]*/gi, ''],
  [/\bvs >= 3\.5\b/gi, ''],
  [/\bYour APS is at [\d.]+[^.]*\.?/gi, ''],
  [/\bYour APS is below[^.]*\.?/gi, ''],
  [/\bcoaching focus:\s*/gi, ''],
  [/\bwhen execution slips on what we track[^.]*\./gi, APS_IMPACT_LINES[0]],
  [/\bupgrade, port, and new-line(?: opportunities| paths)?\b/gi, 'upgrade and new-line opportunities'],
  [/\bupgrade\/port\/new-?line(?: opportunities| paths)?\b/gi, 'upgrade and new-line opportunities'],
  [/\bport opportunities\b/gi, 'activation opportunities'],
  [/\bport activations\b/gi, 'activations'],
  [/\bport paths\b/gi, 'upgrade and new-line paths'],
  [/\bupgrades, ports, and new lines\b/gi, 'upgrades, new lines, and activations'],
  [/\bupgrades, ports, new lines\b/gi, 'upgrades, new lines, and activations'],
  [/\buncovering port\b/gi, 'uncovering upgrade and new-line'],
  [/\b,\s*ports?\b/gi, ''],
]

export const APS_SITUATION_LINES = [
  "We're missing opportunities from customer interactions — not enough upgrades and new lines are getting uncovered.",
  "We're not creating enough activation opportunities from the traffic coming through the store.",
  "There's a gap in fully worked conversations — we're moving on before we've uncovered upgrade and new-line paths.",
]

export const APS_BEHAVIOR_LINES = [
  'We need to slow down interactions and uncover more upgrade and new-line opportunities with customers.',
  'I need you engaging more customers and fully working each interaction before moving on.',
  'We should be creating more activation opportunities throughout the day from the traffic coming in.',
  "We need to make sure we're slowing down conversations and uncovering more opportunities with customers.",
]

const SECTION_BOUNDARY =
  '(?:Manager Follow-Up:|Next Steps:|Pre-Coaching Notes:|Coaching Category:|Situation:|Behavior:|Impact:)'

const WEAK_SECTION_RE =
  /goal is 3\.5|APS target|increase attempts|improve APS|checking carrier eligibility|all available carriers|maximize traffic|maximize attempts|monitor APS|customer traffic opportunities|carrier eligibility|your APS is|below where it needs|current metrics show|vs >= 3\.5|APS goal|target 3\.5|port opportunities|port activations|port paths|upgrade, port|upgrades, ports|\bports?\b/i

/**
 * @param {string} seed
 * @param {string[]} lines
 */
function pickLine(seed, lines) {
  const idx = Math.abs(hashSeed(seed)) % lines.length
  return lines[idx]
}

/**
 * @param {string} s
 */
function hashSeed(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

/**
 * @param {string} text
 */
export function findApsPhraseViolations(text) {
  const violations = []
  for (const pattern of APS_PHRASE_BLACKLIST) {
    const re = new RegExp(pattern.source, pattern.flags)
    if (re.test(text)) violations.push(pattern.source)
  }
  return violations
}

/**
 * @param {string} text
 */
export function applyApsPhraseRewrites(text) {
  let out = String(text ?? '')
  for (const [pattern, replacement] of APS_PHRASE_REPLACEMENTS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

/**
 * @param {string} text
 */
export function forceScrubApsViolations(text) {
  let out = applyApsPhraseRewrites(text)
  for (const pattern of APS_PHRASE_BLACKLIST) {
    out = out.replace(pattern, '')
  }
  return applyApsHumanFloorPass(out)
}

/**
 * @param {string} text
 */
export function applyApsHumanFloorPass(text) {
  let out = String(text ?? '')
  for (const [pattern, replacement] of APS_PHRASE_REPLACEMENTS) {
    out = out.replace(pattern, replacement)
  }
  out = out
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
  return out.trimEnd()
}

/**
 * @param {{ metrics?: { aps?: { value?: number } } }} _intel
 * @param {string} seed
 */
export function buildApsOperationalSituation(_intel, seed) {
  return pickLine(seed, APS_SITUATION_LINES)
}

/**
 * @param {string} seed
 */
export function buildApsOperationalBehavior(seed) {
  return pickLine(seed, APS_BEHAVIOR_LINES)
}

/**
 * @param {string} seed
 */
export function buildApsOperationalImpact(seed) {
  return pickLine(seed, APS_IMPACT_LINES)
}

/**
 * @param {string} text
 */
export function formatApsNextStepsBlock(text) {
  const nextStepsRe = new RegExp(
    `Next Steps:\\s*\\n([\\s\\S]*?)(?=\\n+${SECTION_BOUNDARY}|$)`,
    'i',
  )
  const m = text.match(nextStepsRe)
  if (!m || m.index == null) return text
  const tail = text.slice(m.index + m[0].length)
  const bullets = APS_NEXT_STEPS_BULLETS.map((b) => `• ${b}`)
  return `${text.slice(0, m.index)}Next Steps:\n${bullets.join('\n')}${tail}`
}

/**
 * @param {string} text
 * @param {{ coachingReason?: string; notes?: string } | null | undefined} payload
 */
export function applyApsOperationalCoaching(text, payload) {
  const sourceText = `${payload?.coachingReason ?? ''} ${payload?.notes ?? ''}`.trim()
  if (!sourceText) return String(text ?? '')

  const intel = evaluateOslMetricIntelligence(sourceText, 'coaching')
  const apsMetric = intel.metrics?.aps
  const apsTopic = isApsCoachingTopic(sourceText)
  if (!apsMetric && !apsTopic) return String(text ?? '')

  const seed = sourceText
  let out = applyApsPhraseRewrites(text)

  const needsFloorCoaching = apsTopic || apsMetric?.status === 'needs_coaching'
  if (needsFloorCoaching) {
    out = applyApsCategoryOperationalScaffold(out)
    out = applyApsSectionOperationalScaffold(out, seed)
    out = formatApsNextStepsBlock(out)
  }

  out = applyApsPhraseRewrites(out)
  if (findApsPhraseViolations(out).length > 0) {
    out = forceScrubApsViolations(out)
    out = applyApsSectionOperationalScaffold(out, seed)
    if (needsFloorCoaching) {
      out = formatApsNextStepsBlock(out)
    }
  }

  return applyApsHumanFloorPass(out)
}

/**
 * @param {string} text
 */
function applyApsCategoryOperationalScaffold(text) {
  const categoryRe = /(Coaching Category:\s*\n)([\s\S]*?)(?=\n+Situation:)/i
  if (!categoryRe.test(text)) return text
  const body = text.match(categoryRe)?.[2] ?? ''
  if (/Customer Engagement & Opportunity Creation/i.test(body) && !WEAK_SECTION_RE.test(body)) {
    return text
  }
  return text.replace(categoryRe, `$1${APS_CATEGORY}.\n`)
}

/**
 * @param {string} text
 * @param {string} seed
 */
function applyApsSectionOperationalScaffold(text, seed) {
  const situationRe = new RegExp(
    `(Situation:\\s*\\n?)([\\s\\S]*?)(?=\\n+Behavior:|$)`,
    'i',
  )
  const behaviorRe = new RegExp(`(Behavior:\\s*\\n?)([\\s\\S]*?)(?=\\n+Impact:|$)`, 'i')
  const impactRe = /(Impact:\s*\n?)([\s\S]*?)(?=\n+Next Steps:|\n+Manager Follow-Up:|$)/i
  const followUpRe = /(Manager Follow-Up:\s*\n?)([\s\S]*?)$/i

  let out = text
  const sitBody = text.match(situationRe)?.[2] ?? ''
  if (situationRe.test(out) && WEAK_SECTION_RE.test(sitBody)) {
    out = out.replace(situationRe, `$1${buildApsOperationalSituation({}, `${seed}:sit`)}\n`)
  }
  const behBody = out.match(behaviorRe)?.[2] ?? ''
  if (behaviorRe.test(out) && WEAK_SECTION_RE.test(behBody)) {
    out = out.replace(behaviorRe, `$1${buildApsOperationalBehavior(`${seed}:beh`)}\n`)
  }
  const impBody = out.match(impactRe)?.[2] ?? ''
  if (impactRe.test(out) && WEAK_SECTION_RE.test(impBody)) {
    out = out.replace(impactRe, `$1${buildApsOperationalImpact(`${seed}:imp`)}\n`)
  }
  if (followUpRe.test(out)) {
    out = out.replace(followUpRe, `$1${APS_MANAGER_FOLLOW_UP}\n`)
  }
  return out
}

/**
 * @param {string} text
 * @param {{ coachingReason?: string; notes?: string } | null | undefined} [payload]
 */
export function validateApsCoachingLanguage(text, payload) {
  if (payload && !hasApsCoachingContext(payload)) {
    return { ok: true, violations: [] }
  }
  const violations = findApsPhraseViolations(text)
  return { ok: violations.length === 0, violations }
}

/**
 * @param {string} text
 * @returns {{ pattern: string; count: number }[]}
 */
export function analyzeApsPhraseFrequency(text) {
  const hits = []
  for (const pattern of APS_PHRASE_BLACKLIST) {
    const re = new RegExp(pattern.source, pattern.flags)
    const matches = String(text ?? '').match(re)
    if (matches?.length) hits.push({ pattern: pattern.source, count: matches.length })
  }
  return hits
}

/**
 * @param {{ employeeName?: string; coachingReason?: string; notes?: string }} payload
 * @param {string} name
 */
export function buildApsOnlyOperationalSections(payload, name) {
  const seed = `${payload?.coachingReason ?? ''}|${payload?.notes ?? ''}|${name}`
  return {
    category: `${APS_CATEGORY}.`,
    situation: buildApsOperationalSituation({}, seed),
    behavior: buildApsOperationalBehavior(seed),
    impact: buildApsOperationalImpact(seed),
    nextSteps: APS_NEXT_STEPS_BULLETS.map((b) => `• ${b}`).join('\n'),
    followUp: APS_MANAGER_FOLLOW_UP,
  }
}
