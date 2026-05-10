import { normalizeWhitespace, stripJunkTokens } from './sanitizeCoachingPayload.mjs'
import { COACHING_FORM_SECTION_LABELS } from './coachingSectionConstants.mjs'

/** @type {Record<string, string>} */
export const REFINE_PRESET_INSTRUCTIONS = {
  softer:
    'Rewrite with a softer, less confrontational tone while staying appropriate for retail floor coaching.',
  more_direct: 'Make the language more direct and clear; reduce hedging where appropriate.',
  professional: 'Rewrite to sound more professional and polished for documentation.',
  shorten: 'Shorten while keeping essential facts and actionable clarity.',
  expand: 'Expand slightly with helpful, concrete detail; stay concise overall.',
  clearer_expectations:
    'Clarify expectations and outcomes so the associate knows exactly what good looks like.',
}

export const REFINE_PRESET_KEYS = Object.keys(REFINE_PRESET_INSTRUCTIONS)

/**
 * Match UI labels like "PRE-COACHING NOTES" or alternate keys to canonical section ids.
 * @param {unknown} raw
 * @returns {string}
 */
export function resolveCanonicalSectionName(raw) {
  const candidates = []
  const push = (v) => {
    if (v == null) return
    const s = String(v).trim()
    if (s) candidates.push(s)
  }
  push(raw?.sectionName)
  push(raw?.sectionKey)
  push(raw?.sectionTitle)

  const norm = (s) => s.replace(/\s+/g, ' ').trim().toUpperCase()

  for (const c of candidates) {
    const hit = COACHING_FORM_SECTION_LABELS.find((l) => l.toLowerCase() === c.toLowerCase())
    if (hit) return hit
    const nu = norm(c)
    const hit2 = COACHING_FORM_SECTION_LABELS.find((l) => norm(l.replace(/-/g, ' ')) === nu.replace(/-/g, ' '))
    if (hit2) return hit2
  }

  return ''
}

/**
 * @param {unknown} raw
 * @returns {{
 *   sectionName: string
 *   sectionKey: string
 *   currentSectionText: string
 *   fullGeneratedForm: string
 *   refinementPreset: string | null
 *   refinementInstruction: string
 *   mode: 'coaching' | 'recognition'
 *   employeeName: string
 *   coachingFor: string
 * }}
 */
export function sanitizeRefineSectionPayload(raw) {
  const canonical = resolveCanonicalSectionName(raw)

  const textFromSection =
    raw?.sectionText != null && String(raw.sectionText).length > 0
      ? String(raw.sectionText)
      : String(raw?.currentSectionText ?? '')
  const currentSectionText = textFromSection.slice(0, 12000)

  const fullGeneratedForm = String(raw?.fullGeneratedForm ?? '').slice(0, 48000)

  let refinementPreset = null
  const pr = String(raw?.refinementPreset ?? '').trim()
  if (pr && REFINE_PRESET_KEYS.includes(pr)) {
    refinementPreset = pr
  }

  const refinementInstruction = normalizeWhitespace(raw?.refinementInstruction ?? '').slice(0, 2000)

  const rawMode = String(raw?.mode ?? '')
    .trim()
    .toLowerCase()
  const mode = rawMode === 'recognition' ? 'recognition' : 'coaching'

  const employeeName = stripJunkTokens(raw?.employeeName)
  const coachingFor = stripJunkTokens(raw?.coachingFor ?? raw?.coachingReason ?? '')

  const titleRaw = String(raw?.sectionTitle ?? '').trim()

  return {
    sectionName: canonical,
    sectionKey: canonical,
    sectionTitle: titleRaw || canonical,
    currentSectionText,
    fullGeneratedForm,
    refinementPreset,
    refinementInstruction,
    mode,
    employeeName,
    coachingFor,
  }
}

/**
 * @param {ReturnType<typeof sanitizeRefineSectionPayload>} p
 * @returns {string | null} error message or null if ok
 */
export function validateRefineSectionPayload(p) {
  if (!p.sectionName) return 'Unknown or invalid section (use a standard section name).'
  if (!p.currentSectionText.trim()) return 'Section text is missing.'
  if (!p.fullGeneratedForm.trim()) return 'Form context is missing.'
  if (!p.refinementPreset && !p.refinementInstruction.trim()) {
    return 'Pick a quick refinement or enter custom instructions.'
  }
  return null
}

/**
 * @param {ReturnType<typeof sanitizeRefineSectionPayload>} p
 * @returns {string}
 */
export function buildRefinementDirective(p) {
  const parts = []
  if (p.refinementPreset && REFINE_PRESET_INSTRUCTIONS[p.refinementPreset]) {
    parts.push(REFINE_PRESET_INSTRUCTIONS[p.refinementPreset])
  }
  if (p.refinementInstruction.trim()) {
    parts.push(p.refinementInstruction.trim())
  }
  return parts.join('\n\n')
}
