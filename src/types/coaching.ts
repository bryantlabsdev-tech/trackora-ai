import type { CoachingWorkspace } from './profile'

/** Corrective coaching vs positive recognition — same form layout, different tone. */
export type FormMode = 'coaching' | 'recognition'

export type { CoachingWorkspace } from './profile'

/** Minimal input for coaching form generation. */
export type SimpleCoachingInput = {
  employeeName: string
  /**
   * Main reason / topic. APS / HPA / MPT meanings are fixed server-side for the AI (Attempts Per Shift,
   * HPA = postpaid production efficiency vs hours worked, MPT = transaction/process speed,
   * APS = engagement/attempt generation).
   */
  coachingReason: string
  /** Supporting context, observations, or numbers (e.g. metric values, dates). */
  notes: string
}

/** Payload sent to POST /api/ai. */
export type CoachingLogApiPayload = SimpleCoachingInput & {
  mode: FormMode
  coachingWorkspace: CoachingWorkspace
  /** Routing hint for industry context (e.g. "mobile_expert"). */
  coachingType?: string
  /** Routing hint for role context (e.g. "ME" / "Mobile Expert"). */
  role?: string
}

/**
 * Retail-style section labels (model output uses `Label:` lines).
 */
export const COACHING_FORM_SECTION_LABELS = [
  'Pre-Coaching Notes',
  'Coaching Category',
  'Situation',
  'Behavior',
  'Impact',
  'Next Steps',
  'Manager Follow-Up',
] as const

export type CoachingFormSectionLabel = (typeof COACHING_FORM_SECTION_LABELS)[number]

/** Quick refinement modes — must match `shared/refineSectionPayload.mjs` REFINE_PRESET_INSTRUCTIONS keys. */
export type RefinePreset =
  | 'softer'
  | 'more_direct'
  | 'professional'
  | 'shorten'
  | 'expand'
  | 'clearer_expectations'

/** POST /api/ai action `refine_section` payload (aliases supported server-side). */
export type RefineSectionApiPayload = {
  /** Canonical section id — same as `sectionKey` when both sent. */
  sectionName: CoachingFormSectionLabel
  /** Same as `sectionName`; optional duplicate for clarity. */
  sectionKey?: CoachingFormSectionLabel
  currentSectionText: string
  /** Alias for `currentSectionText` */
  sectionText?: string
  fullGeneratedForm: string
  refinementPreset: RefinePreset | null
  refinementInstruction: string
  mode: FormMode
  employeeName: string
  /** Coaching topic / “coaching form is for” — keeps refinement on-topic. */
  coachingFor?: string
  coachingWorkspace: CoachingWorkspace
}
