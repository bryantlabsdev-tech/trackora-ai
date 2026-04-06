/**
 * Normalize whitespace: trim and collapse internal runs to a single space.
 * @param {unknown} value
 */
export function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Strip stray whole-word junk tokens (e.g. accidental "sq") from free text.
 * @param {unknown} value
 */
export function stripJunkTokens(value) {
  let s = String(value ?? '')
  s = s.replace(/\bsq\b/gi, ' ')
  return normalizeWhitespace(s)
}

/** Notes that are empty, placeholder-only, or too short to be useful. */
const MEANINGLESS_NOTE_EXACT = new Set(
  [
    'n/a',
    'na',
    'none',
    'nil',
    '-',
    '--',
    '—',
    '.',
    '..',
    '...',
    '?',
    'tbd',
    'tba',
    'test',
    'testing',
    'xxx',
    'xx',
    'x',
  ].map((w) => w.toLowerCase())
)

const NOTES_MIN_LEN = 3

/**
 * True if notes should be dropped (ignored) for generation.
 * @param {string} normalizedNotes output of stripJunkTokens
 */
export function isMeaninglessNotes(normalizedNotes) {
  const t = normalizedNotes.toLowerCase()
  if (t.length < NOTES_MIN_LEN) return true
  if (MEANINGLESS_NOTE_EXACT.has(t)) return true
  if (!/[a-z0-9]/i.test(t)) return true
  return false
}

/**
 * Sanitize coaching form input before model / fallback.
 * @param {{ employeeName?: unknown; coachingReason?: unknown; notes?: unknown; mode?: unknown }} payload
 * @returns {{ employeeName: string; coachingReason: string; notes: string; mode: 'coaching' | 'recognition' }}
 */
export function sanitizeCoachingPayload(payload) {
  const employeeName = stripJunkTokens(payload?.employeeName)
  const coachingReason = stripJunkTokens(payload?.coachingReason)
  let notes = stripJunkTokens(payload?.notes)
  if (isMeaninglessNotes(notes)) {
    notes = ''
  }
  const rawMode = String(payload?.mode ?? '')
    .trim()
    .toLowerCase()
  const mode = rawMode === 'recognition' ? 'recognition' : 'coaching'
  return { employeeName, coachingReason, notes, mode }
}
