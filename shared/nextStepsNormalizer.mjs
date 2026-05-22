import { shouldUseMobileExpertContext } from './coachingContextRouting.mjs'
import { evaluateOslMetricIntelligence } from './oslMetricIntelligence.mjs'
import {
  APS_NEXT_STEPS_BULLETS,
  APS_NEXT_STEPS_FALLBACK_POOL,
  APS_PHRASE_BLACKLIST,
  hasApsCoachingContext,
} from './apsOperationalLanguage.mjs'
import { normalizeFrontlineVocabulary } from './frontlineVocabulary.mjs'

export const MIN_COACHING_NEXT_STEPS_BULLETS = 5

const HPA_WIRELESS_FILLERS = [
  'Create more postpaid opportunities throughout the shift',
  'Use stronger discovery questions to uncover upgrade and port paths',
  'Present postpaid and carrier options consistently during traffic',
  'Engage traffic earlier instead of waiting for customers to approach',
  'Drive urgency and proactive engagement during peak traffic windows',
]

const WIRELESS_FILLERS = [
  'Engage more customers throughout the shift, not only during rushes',
  'Present postpaid options in more customer conversations',
  'Focus on uncovering upgrades, ports, and new lines with stronger discovery questions',
  'Keep urgency up during slower traffic windows',
  'Stay active on the floor and avoid passive downtime between interactions',
]

/** @deprecated Use APS_NEXT_STEPS_BULLETS from apsOperationalLanguage.mjs */
export const APS_WIRELESS_FILLERS = APS_NEXT_STEPS_BULLETS

const GENERAL_FILLERS = [
  'Address the issue early in the shift so it does not snowball',
  'Stay consistent with the expectation in each part of the day',
  'Use clear communication when blockers come up',
  'Avoid passive downtime and keep work moving',
  'Give a quick progress update before end of shift',
]

const BLOCKED_BULLET_PATTERNS = [
  /\bworkflow optimization\b/i,
  /\bqualifying leads?\b/i,
  /\bprocess efficiency\b/i,
  /\bactivation flow\b/i,
  /\bsales closure\b/i,
  /\bclosing techniques?\b/i,
  /\bserve customers better\b/i,
  /\bmake the most of our time on the floor\b/i,
  /\btrack your APS regularly\b/i,
  /\bmonitor your APS\b/i,
  /\bcustomer service improvement\b/i,
  /\btrack attempts\b/i,
  /\bincrease engagement only\b/i,
  /\bincrease attempts\b/i,
  /\btarget at least 3\.5 APS\b/i,
  /\bmonitor APS\b/i,
  /\btablet eligibility\b/i,
  /\bget(?:ting)? customers to the tablet\b/i,
  /\bfocus on tablet eligibility\b/i,
  /\buse the tablet for eligibility\b/i,
  ...APS_PHRASE_BLACKLIST,
]

const SECTION_BOUNDARY =
  '(?:Manager Follow-Up:|Pre-Coaching Notes:|Coaching Category:|Situation:|Behavior:|Impact:)'

const NEXT_STEPS_SECTION_RE = new RegExp(
  `Next Steps:\\s*\\n([\\s\\S]*?)(?=\\n+${SECTION_BOUNDARY}|$)`,
  'i',
)

/**
 * @param {{ coachingReason?: string; notes?: string; coachingWorkspace?: string; coachingType?: string; role?: string } | null | undefined} payload
 * @returns {string[]}
 */
export function pickNextStepsPool(payload) {
  if (hasApsCoachingContext(payload)) {
    return [...APS_NEXT_STEPS_FALLBACK_POOL]
  }

  const sourceText = `${payload?.coachingReason ?? ''} ${payload?.notes ?? ''}`.trim()
  if (!shouldUseMobileExpertContext(payload)) return GENERAL_FILLERS

  if (sourceText) {
    const intel = evaluateOslMetricIntelligence(sourceText, 'coaching')
    if (intel.metrics?.aps?.status === 'needs_coaching') {
      return [...APS_NEXT_STEPS_FALLBACK_POOL]
    }
    if (intel.metrics?.hpa?.status === 'needs_coaching') return [...HPA_WIRELESS_FILLERS]
    if (intel.metrics?.mpt?.status === 'needs_coaching') {
      return [
        'Tighten transaction pace and reduce step-to-step gaps',
        'Build system confidence and prepare next steps earlier',
        'Pre-stage accessories and devices before activation steps',
        'Reset quickly between customers so one sale does not stall the shift',
        'Keep urgency up and stay active between customer interactions',
      ]
    }
  }
  return WIRELESS_FILLERS
}

/**
 * @param {string} body
 * @returns {string[]}
 */
export function extractNextStepsBulletLines(body) {
  const bullets = []
  for (const rawLine of String(body ?? '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const bulletMatch = line.match(/^(?:[-•*]\s+|\d+[.)]\s+)(.+)$/)
    if (bulletMatch) {
      bullets.push(bulletMatch[1].trim())
      continue
    }
    if (bullets.length === 0 && line.length > 0) {
      bullets.push(line)
    }
  }
  return bullets
}

/**
 * @param {string} s
 */
function cleanBulletText(s) {
  return normalizeFrontlineVocabulary(
    String(s ?? '')
      .trim()
      .replace(/[.]+$/, ''),
  )
}

/**
 * @param {string} text
 * @returns {number}
 */
export function countNextStepsBullets(text) {
  const m = String(text ?? '').match(NEXT_STEPS_SECTION_RE)
  if (!m) return 0
  return extractNextStepsBulletLines(m[1]).length
}

/**
 * @param {string[]} bullets
 * @param {string[]} pool
 * @param {number} min
 */
function fillBulletsFromPool(bullets, pool, min) {
  for (const filler of pool) {
    if (bullets.length >= min) break
    const normalized = cleanBulletText(filler)
    if (!normalized) continue
    if (BLOCKED_BULLET_PATTERNS.some((re) => re.test(normalized))) continue
    const dupe = bullets.some((b) => b.toLowerCase() === normalized.toLowerCase())
    if (!dupe) bullets.push(normalized)
  }

  if (pool.length === 0) return

  let poolIdx = 0
  const maxAttempts = Math.max(pool.length * 3, min * 3)
  while (bullets.length < min && poolIdx < maxAttempts) {
    const normalized = cleanBulletText(pool[poolIdx % pool.length])
    poolIdx += 1
    if (!normalized || BLOCKED_BULLET_PATTERNS.some((re) => re.test(normalized))) continue
    const dupe = bullets.some((b) => b.toLowerCase() === normalized.toLowerCase())
    if (!dupe) bullets.push(normalized)
  }

  poolIdx = 0
  while (bullets.length < min && poolIdx < pool.length) {
    const normalized = cleanBulletText(pool[poolIdx])
    poolIdx += 1
    if (!normalized) continue
    bullets.push(normalized)
  }
}

/**
 * @param {string} text
 * @param {Record<string, unknown>} payload
 * @param {number} min
 * @param {string[] | null} [poolOverride]
 */
function buildNextStepsBlock(text, payload, min = MIN_COACHING_NEXT_STEPS_BULLETS, poolOverride = null) {
  const m = text.match(NEXT_STEPS_SECTION_RE)
  const existing = m ? extractNextStepsBulletLines(m[1]) : []

  /** @type {string[]} */
  const bullets = []
  for (const raw of existing) {
    const cleaned = cleanBulletText(raw)
    if (!cleaned) continue
    if (BLOCKED_BULLET_PATTERNS.some((re) => re.test(cleaned))) continue
    const dupe = bullets.some((b) => b.toLowerCase() === cleaned.toLowerCase())
    if (!dupe) bullets.push(cleaned)
  }

  const pool = poolOverride ?? pickNextStepsPool(payload)
  fillBulletsFromPool(bullets, pool, min)

  const block = bullets.slice(0, min).map((b) => `• ${b}`).join('\n')
  if (m) {
    return text.replace(NEXT_STEPS_SECTION_RE, `Next Steps:\n${block}`)
  }
  if (/\n+Manager Follow-Up:/i.test(text)) {
    return text.replace(/\n+Manager Follow-Up:/i, `\n\nNext Steps:\n${block}\n\nManager Follow-Up:`)
  }
  return `${text}\n\nNext Steps:\n${block}`
}

/**
 * APS coaching: always exactly 5 floor-safe bullets (merge kept bullets + fallbacks).
 * @param {string} text
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
export function enforceApsFiveNextStepsBullets(text, payload) {
  if ((payload?.mode || 'coaching') !== 'coaching') return String(text ?? '')
  if (!hasApsCoachingContext(payload)) return String(text ?? '')

  let out = buildNextStepsBlock(
    String(text ?? ''),
    payload,
    MIN_COACHING_NEXT_STEPS_BULLETS,
    APS_NEXT_STEPS_FALLBACK_POOL,
  )

  if (countNextStepsBullets(out) < MIN_COACHING_NEXT_STEPS_BULLETS) {
    const forced = APS_NEXT_STEPS_FALLBACK_POOL.slice(0, MIN_COACHING_NEXT_STEPS_BULLETS)
      .map((b) => `• ${cleanBulletText(b)}`)
      .join('\n')
    out = buildNextStepsBlock(`Next Steps:\n${forced}`, payload, MIN_COACHING_NEXT_STEPS_BULLETS, APS_NEXT_STEPS_FALLBACK_POOL)
  }

  return out
}

/**
 * @param {string} text
 * @param {{ mode?: string; coachingWorkspace?: string; coachingType?: string; role?: string; coachingReason?: string; notes?: string } | null | undefined} payload
 * @returns {string}
 */
export function normalizeNextStepsBullets(text, payload) {
  if ((payload?.mode || 'coaching') !== 'coaching') return String(text ?? '')
  if (hasApsCoachingContext(payload)) {
    return enforceApsFiveNextStepsBullets(text, payload)
  }
  return buildNextStepsBlock(String(text ?? ''), payload, MIN_COACHING_NEXT_STEPS_BULLETS)
}

/**
 * Hard contract: coaching mode always returns >= 5 Next Steps bullets.
 * @param {string} text
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
export function enforceFiveNextStepsBullets(text, payload) {
  if ((payload?.mode || 'coaching') !== 'coaching') return String(text ?? '')
  if (hasApsCoachingContext(payload)) {
    return enforceApsFiveNextStepsBullets(text, payload)
  }

  let out = buildNextStepsBlock(String(text ?? ''), payload, MIN_COACHING_NEXT_STEPS_BULLETS)
  if (countNextStepsBullets(out) >= MIN_COACHING_NEXT_STEPS_BULLETS) return out

  out = buildNextStepsBlock(out, payload, MIN_COACHING_NEXT_STEPS_BULLETS)
  if (countNextStepsBullets(out) >= MIN_COACHING_NEXT_STEPS_BULLETS) return out

  const forced = pickNextStepsPool(payload)
    .slice(0, MIN_COACHING_NEXT_STEPS_BULLETS)
    .map((b) => `• ${cleanBulletText(b)}`)
    .join('\n')
  return buildNextStepsBlock(`Next Steps:\n${forced}`, payload, MIN_COACHING_NEXT_STEPS_BULLETS)
}
