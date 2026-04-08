import type { CoachingLogApiPayload } from '../types/coaching'
import { buildDeterministicCoachingForm } from '../../shared/coachingIssueClassifier.mjs'
import { polishGeneratedCoachingForm } from '../../shared/coachingOutput.mjs'

/** Offline / no-AI form — keyword-classified, same logic as server deterministic path. */
export function getCoachingLogFallback(payload: CoachingLogApiPayload): string {
  const rawName = payload.employeeName
  const draft = buildDeterministicCoachingForm({
    employeeName: payload.employeeName,
    coachingReason: payload.coachingReason.trim(),
    notes: payload.notes.trim(),
    mode: payload.mode,
  })
  return polishGeneratedCoachingForm(draft, rawName)
}
