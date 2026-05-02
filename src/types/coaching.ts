/** Corrective coaching vs positive recognition — same form layout, different tone. */
export type FormMode = 'coaching' | 'recognition'

/** Minimal input for coaching form generation. */
export type SimpleCoachingInput = {
  employeeName: string
  /**
   * Main reason / topic. APS / HPA / MPT meanings are fixed server-side for the AI (Attempts Per Shift,
   * Hours Per Activation, minutes between customer interactions — not transaction length).
   */
  coachingReason: string
  /** Supporting context, observations, or numbers (e.g. metric values, dates). */
  notes: string
}

/** Payload sent to POST /api/ai. */
export type CoachingLogApiPayload = SimpleCoachingInput & {
  mode: FormMode
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
