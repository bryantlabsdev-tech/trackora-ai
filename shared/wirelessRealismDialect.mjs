import { shouldUseMobileExpertContext } from './coachingContextRouting.mjs'

const REALISM_REPLACEMENTS = [
  [/\bconversion activity\b/gi, 'consistent postpaid conversations through traffic'],
  [/\btransaction closures\b/gi, 'customer conversations turning into postpaid opportunities'],
  [/\boperational efficiency\b/gi, 'floor execution pace'],
  [/\bprocess improvement\b/gi, 'cleaner floor execution'],
  [/\bsales closure\b/gi, 'more conversations turning into postpaid opportunities'],
  [/\boverall productivity\b/gi, 'postpaid output pace'],
  [/\bI need you to focus on\b/gi, 'Need more'],
  [/\bI need you to\b/gi, 'Need you to'],
  [/\bThere needs to be more\b/gi, 'Need more'],
  [/\bIt is important to\b/gi, 'Need to'],
  [/\bYou need to\b/gi, 'Need to'],
]

/**
 * Make wireless coaching output shorter, more direct, and less polished.
 * Applies only in Mobile Expert context.
 * @param {string} text
 * @param {{ coachingReason?: string; notes?: string; coachingWorkspace?: string; coachingType?: string; role?: string } | null | undefined} payload
 * @returns {string}
 */
export function applyWirelessRealismDialect(text, payload) {
  let out = String(text ?? '')
  if (!shouldUseMobileExpertContext(payload)) return out

  for (const [pattern, replacement] of REALISM_REPLACEMENTS) {
    out = out.replace(pattern, replacement)
  }

  // Light cadence shortening without destroying section structure.
  out = out
    .replace(/\bwe are\b/gi, "we're")
    .replace(/\bdo not\b/gi, "don't")
    .replace(/\bthroughout the entirety of\b/gi, 'through')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')

  return out
}

