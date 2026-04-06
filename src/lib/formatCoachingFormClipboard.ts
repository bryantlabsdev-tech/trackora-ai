import { COACHING_FORM_SECTION_LABELS, type CoachingFormSectionLabel } from '../types/coaching'
import type { ParsedCoachingSection } from './parseCoachingLog'

const LABEL_SET = new Set<string>(COACHING_FORM_SECTION_LABELS)

function sectionBody(sections: ParsedCoachingSection[], label: CoachingFormSectionLabel): string {
  const found = sections.find((s) => s.id === label)
  return (found?.body ?? '').trim()
}

/**
 * Turn Next Steps body into lines starting with "- " (plain text for paste into forms).
 */
export function formatNextStepsForClipboard(body: string): string {
  const raw = body.trim()
  if (!raw) return ''

  const lines = raw.split(/\r?\n/).map((l) => l.trim())
  const bullets: string[] = []

  for (const line of lines) {
    if (!line) continue
    const stripped = line
      .replace(/^[•\-\*]\s*/, '')
      .replace(/^\d+[.)]\s+/, '')
      .trim()
    if (stripped) bullets.push(`- ${stripped}`)
  }

  if (bullets.length === 0) {
    return `- ${raw}`
  }

  return bullets.join('\n')
}

/**
 * One section block for clipboard: "Label:\nbody" (Next Steps uses hyphen bullets).
 */
export function formatSectionClipboardBlock(sectionLabel: string, body: string): string {
  const trimmed = (body ?? '').trim()
  if (!trimmed) return ''

  if (sectionLabel === 'Next Steps') {
    const bullets = formatNextStepsForClipboard(trimmed)
    return bullets ? `Next Steps:\n${bullets}` : ''
  }

  return `${sectionLabel}:\n${trimmed}`
}

export function sectionClipboardHasContent(sectionLabel: string, body: string): boolean {
  return formatSectionClipboardBlock(sectionLabel, body).length > 0
}

/**
 * Plain-text coaching form for clipboard — no markdown, JSON, or HTML.
 * Missing sections render as empty lines under each header.
 */
export function formatCoachingFormForClipboard(
  sections: ParsedCoachingSection[],
  rawFallback: string,
): string {
  const fallbackTrim = rawFallback.trim()
  if (
    sections.length === 1 &&
    sections[0].id === 'Coaching form' &&
    sections[0].body.trim().length > 0
  ) {
    return fallbackTrim || sections[0].body.trim()
  }

  if (sections.length === 0 && fallbackTrim) {
    return fallbackTrim
  }

  const pre = sectionBody(sections, 'Pre-Coaching Notes')
  const category = sectionBody(sections, 'Coaching Category')
  const situation = sectionBody(sections, 'Situation')
  const behavior = sectionBody(sections, 'Behavior')
  const impact = sectionBody(sections, 'Impact')
  const nextSteps = formatNextStepsForClipboard(sectionBody(sections, 'Next Steps'))
  const followUp = sectionBody(sections, 'Manager Follow-Up')

  const hasAnyKnown = sections.some((s) => LABEL_SET.has(s.id))
  if (!hasAnyKnown && fallbackTrim) {
    return fallbackTrim
  }

  return [
    'Pre-Coaching Notes:',
    pre,
    '',
    'Coaching Category:',
    category,
    '',
    'Situation:',
    situation,
    '',
    'Behavior:',
    behavior,
    '',
    'Impact:',
    impact,
    '',
    'Next Steps:',
    nextSteps,
    '',
    'Manager Follow-Up:',
    followUp,
  ].join('\n')
}

/**
 * Copy plain text; uses Clipboard API when available, else execCommand fallback.
 */
export async function copyPlainTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* try fallback */
  }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    ta.style.top = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
