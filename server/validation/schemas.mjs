import { z } from 'zod'

const coachingWorkspaceSchema = z.enum(['mobile_sales', 'general_workplace'])
const formModeSchema = z.enum(['coaching', 'recognition'])
const coachingRecordStatusSchema = z.enum(['Draft', 'Shared', 'Completed', 'Follow-up Needed'])

export const coachingLogPayloadSchema = z
  .object({
    employeeName: z.string().max(200).optional(),
    coachingReason: z.string().max(8_000).optional(),
    notes: z.string().max(8_000).optional(),
    coachingType: z.string().max(120).optional(),
    role: z.string().max(120).optional(),
    mode: formModeSchema.optional(),
    coachingWorkspace: coachingWorkspaceSchema.optional(),
    workspace: coachingWorkspaceSchema.optional(),
    isTutorialRun: z.boolean().optional(),
  })
  .passthrough()

export const refineSectionPayloadSchema = z
  .object({
    sectionName: z.string().max(120).optional(),
    sectionKey: z.string().max(120).optional(),
    sectionTitle: z.string().max(120).optional(),
    sectionText: z.string().max(12_000).optional(),
    currentSectionText: z.string().max(12_000).optional(),
    fullGeneratedForm: z.string().max(64_000).optional(),
    refinementPreset: z
      .enum(['softer', 'more_direct', 'professional', 'shorten', 'expand', 'clearer_expectations'])
      .optional()
      .nullable(),
    refinementInstruction: z.string().max(4_000).optional(),
    mode: formModeSchema.optional(),
    employeeName: z.string().max(200).optional(),
    coachingFor: z.string().max(8_000).optional(),
    coachingWorkspace: coachingWorkspaceSchema.optional(),
  })
  .passthrough()

export const apiAiRequestSchema = z.object({
  action: z.string().min(1).max(64),
  payload: z.record(z.unknown()),
})

export const createCheckoutSessionSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID'),
  email: z.string().max(320).optional(),
  planTier: z.enum(['pro', 'elite']).optional(),
})

export const updateCoachingRecordSchema = z
  .object({
    status: coachingRecordStatusSchema.optional(),
    followUpDueAt: z.string().datetime({ offset: true }).optional().nullable(),
    markFollowUpCompleted: z.boolean().optional(),
  })
  .strict()

/**
 * @param {unknown} body
 * @returns {{ ok: true, data: z.infer<typeof apiAiRequestSchema> } | { ok: false, error: string }}
 */
export function parseApiAiRequest(body) {
  const parsed = apiAiRequestSchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ') || 'Invalid request body'
    return { ok: false, error: msg }
  }
  if (!parsed.data.payload || typeof parsed.data.payload !== 'object' || Array.isArray(parsed.data.payload)) {
    return { ok: false, error: 'Expected { action, payload } with a JSON object payload.' }
  }
  return { ok: true, data: parsed.data }
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, data: z.infer<typeof createCheckoutSessionSchema> } | { ok: false, error: string }}
 */
export function parseCreateCheckoutSession(body) {
  const parsed = createCheckoutSessionSchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ') || 'Invalid checkout body'
    return { ok: false, error: msg }
  }
  return { ok: true, data: parsed.data }
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, data: z.infer<typeof updateCoachingRecordSchema> } | { ok: false, error: string }}
 */
export function parseUpdateCoachingRecord(body) {
  const parsed = updateCoachingRecordSchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ') || 'Invalid coaching record update body'
    return { ok: false, error: msg }
  }
  return { ok: true, data: parsed.data }
}
