import { shouldUseMobileExpertContext } from './coachingContextRouting.mjs'

const COMPRESSION_REPLACEMENTS = [
  [/\bI need you to focus on improving conversion activity\b/gi, 'Need more postpaid conversations throughout the shift'],
  [/\bThis means there are missed activation opportunities during customer interactions\b/gi, "We're missing too many postpaid opportunities during traffic"],
  [/\bindicating there(?:'|’)s a gap in postpaid activations relative to the hours worked\b/gi, 'Need stronger postpaid production throughout the shift'],
  [/\bwith regard to\b/gi, 'on'],
  [/\bin order to\b/gi, 'to'],
  [/\boverall\b/gi, ''],
  [/\bcurrently\b/gi, ''],
]

/**
 * Compress and de-polish coaching tone to frontline cadence.
 * Applies only in Mobile Expert coaching mode.
 * @param {string} text
 * @param {{ mode?: string; coachingWorkspace?: string; coachingType?: string; role?: string } | null | undefined} payload
 * @returns {string}
 */
export function applyHumanCompression(text, payload) {
  let out = String(text ?? '')
  if ((payload?.mode || 'coaching') !== 'coaching') return out
  if (!shouldUseMobileExpertContext(payload)) return out

  for (const [pattern, replacement] of COMPRESSION_REPLACEMENTS) {
    out = out.replace(pattern, replacement)
  }

  // HPA directness pattern
  out = out.replace(
    /Your HPA[^.\n]*?(?:which means|meaning|indicating)[^.\n]*\./gi,
    'Your HPA is still too high. Need stronger postpaid production throughout the shift.',
  )

  // Tighten long explanatory sentence glue.
  out = out
    .replace(/\s+,/g, ',')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\.\s+This means/gi, ". We're seeing")

  return out
}

