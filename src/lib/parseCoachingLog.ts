import { COACHING_FORM_SECTION_LABELS } from '../types/coaching'

export type ParsedCoachingSection = {
  id: string
  body: string
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Parses coaching form output where each section starts with `Label:` (Walmart/OSL style).
 * Also accepts optional markdown `## ` before the label for robustness.
 */
export function parseCoachingLogMarkdown(text: string): ParsedCoachingSection[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const lines = trimmed.split(/\r?\n/)
  const sections: ParsedCoachingSection[] = []
  let current: string | null = null
  let body: string[] = []

  const pushSection = () => {
    if (current !== null) {
      sections.push({ id: current, body: body.join('\n').trim() })
      current = null
      body = []
    }
  }

  for (const line of lines) {
    const t = line.trimEnd()
    let matched = false

    for (const label of COACHING_FORM_SECTION_LABELS) {
      const re = new RegExp(
        `^(?:#{1,2}\\s*)?(?:[*_]{0,2})?(${escapeRegex(label)})(?:[*_]{0,2})?:\\s*(.*)$`,
        'i',
      )
      const m = t.match(re)
      if (m) {
        const preamble = current === null && body.length > 0 ? body.join('\n').trim() : ''
        pushSection()
        current = label
        const rest = (m[2] ?? '').trim()
        body = []
        if (preamble) body.push(preamble)
        if (rest) body.push(rest)
        matched = true
        break
      }
    }

    if (!matched) {
      body.push(line)
    }
  }

  pushSection()

  if (sections.length === 0) {
    return [{ id: 'Coaching form', body: trimmed }]
  }

  return sections
}
