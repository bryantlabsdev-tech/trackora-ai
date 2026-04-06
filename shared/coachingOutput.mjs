/** @param {string} w */
function capitalizeWord(w) {
  if (!w) return w
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
}

/**
 * Title-case employee name (words and hyphenated parts).
 * @param {string} raw
 */
export function formatPersonName(raw) {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!s) return 'Associate'
  return s
    .split(' ')
    .map((part) => part.split('-').map(capitalizeWord).join('-'))
    .join(' ')
}

/** @param {string} s */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Replace all case variants of the employee's full name with canonical title case.
 * @param {string} text
 * @param {string} rawEmployeeName
 */
export function normalizeEmployeeNameInText(text, rawEmployeeName) {
  const canonical = formatPersonName(rawEmployeeName)
  const trimmed = String(rawEmployeeName ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!trimmed) return text

  const words = trimmed.split(' ')
  const pattern = new RegExp('\\b' + words.map(escapeRegExp).join('\\s+') + '\\b', 'gi')
  return text.replace(pattern, canonical)
}

const SECTION_HEADERS = [
  'Pre-Coaching Notes:',
  'Coaching Category:',
  'Situation:',
  'Behavior:',
  'Impact:',
  'Next Steps:',
  'Manager Follow-Up:',
]

/**
 * Name normalization + light sentence casing (section opens, after . ? !, bullet lines).
 * @param {string} text
 * @param {string} rawEmployeeName
 */
export function polishGeneratedCoachingForm(text, rawEmployeeName) {
  let t = normalizeEmployeeNameInText(text, rawEmployeeName)

  for (const h of SECTION_HEADERS) {
    const re = new RegExp(`(${escapeRegExp(h)}\\s*\\n)([a-z])`, 'g')
    t = t.replace(re, (_, prefix, ch) => prefix + ch.toUpperCase())
  }

  t = t.replace(/([.!?])\s+([a-z])/g, (_, p, ch) => `${p} ${ch.toUpperCase()}`)

  t = t.replace(/\n(•\s+)([a-z])/g, (_, b, ch) => '\n' + b + ch.toUpperCase())
  t = t.replace(/\n(-\s+)([a-z])/g, (_, b, ch) => '\n' + b + ch.toUpperCase())

  return t
}
