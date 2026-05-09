/**
 * Detects reminder / light-coaching intent from optional notes (and sometimes reason).
 * Used to soften AI prompts and deterministic fallback output.
 */

const REMINDER_NEEDLES = [
  'just a reminder',
  'friendly reminder',
  'not a write up',
  'not a write-up',
  'light coaching',
  'verbal reminder',
]

/**
 * @param {unknown} notes
 * @param {unknown} [coachingReason]
 * @returns {boolean}
 */
export function isLightReminderCoaching(notes, coachingReason = '') {
  const hay = `${String(notes ?? '')} ${String(coachingReason ?? '')}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  return REMINDER_NEEDLES.some((x) => hay.includes(x))
}

/**
 * Strip notes that only restate reminder intent so we do not repeat them in Pre-Coaching Notes.
 * @param {unknown} notes
 * @returns {string}
 */
export function stripToneOnlyNotes(notes) {
  const n = String(notes ?? '').trim()
  if (!n) return ''
  const low = n.toLowerCase().replace(/\s+/g, ' ')
  const only = new Set([
    'this is just a reminder',
    'this is just a reminder.',
    'just a reminder',
    'just a reminder.',
    'friendly reminder',
    'friendly reminder.',
    'this is a friendly reminder',
    'this is a friendly reminder.',
    'verbal reminder',
    'verbal reminder.',
    'light coaching',
    'light coaching.',
    'not a write up',
    'not a write up.',
    'not a write-up',
    'not a write-up.',
  ])
  if (only.has(low)) return ''
  return n
}
