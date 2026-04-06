/** Corrective coaching vs positive recognition — same form layout, different tone. */
export type FormMode = 'coaching' | 'recognition'

/** Minimal input for coaching form generation. */
export type SimpleCoachingInput = {
  employeeName: string
  /** Main reason / topic for the coaching form (e.g. "low APS and accessory sales"). */
  coachingReason: string
  /** Supporting context, observations, or numbers. */
  notes: string
}

/** Payload sent to POST /api/ai. */
export type CoachingLogApiPayload = SimpleCoachingInput & {
  mode: FormMode
}

/**
 * Walmart / OSL-style section labels (model output uses `Label:` lines).
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
