import type { CoachingLogApiPayload } from '../types/coaching'
import { buildDeterministicCoachingForm } from '../../shared/coachingIssueClassifier.mjs'
import { finalizeCoachingOutput } from '../../shared/coachingOutputContract.mjs'

/** Offline / no-AI form — keyword-classified, same post-processing contract as server. */
export function getCoachingLogFallback(payload: CoachingLogApiPayload): string {
  const rawName = payload.employeeName
  const draft = buildDeterministicCoachingForm({
    employeeName: payload.employeeName,
    coachingReason: payload.coachingReason.trim(),
    notes: payload.notes.trim(),
    mode: payload.mode,
    coachingWorkspace: payload.coachingWorkspace,
    coachingType: payload.coachingType,
    role: payload.role,
  })
  return finalizeCoachingOutput(draft, rawName, {
    mode: payload.mode,
    coachingReason: payload.coachingReason,
    notes: payload.notes,
    coachingWorkspace: payload.coachingWorkspace,
    coachingType: payload.coachingType,
    role: payload.role,
  })
}
