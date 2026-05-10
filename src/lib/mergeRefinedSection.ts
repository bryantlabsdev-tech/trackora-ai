import type { CoachingFormSectionLabel } from '../types/coaching'
import { parseCoachingLogMarkdown } from './parseCoachingLog'

/**
 * Replace one section body in the full coaching log text while preserving structure for `parseCoachingLogMarkdown`.
 */
export function mergeRefinedSectionIntoLog(
  fullLogText: string,
  sectionLabel: CoachingFormSectionLabel,
  newBody: string,
): string {
  const trimmedNew = newBody.trim()
  const sections = parseCoachingLogMarkdown(fullLogText)
  const idx = sections.findIndex((s) => s.id === sectionLabel)
  if (idx === -1) return fullLogText
  const updated = sections.map((s, i) => (i === idx ? { ...s, body: trimmedNew } : s))
  return updated.map((s) => `${s.id}:\n${s.body}`.trim()).join('\n\n').trim()
}
