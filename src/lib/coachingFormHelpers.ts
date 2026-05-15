import { parseCoachingWorkspace } from '../../shared/coachingWorkspace.mjs'
import type { SimpleCoachingInput } from '../types/coaching'
import { WORKSPACE_STORAGE_KEY } from './workspaceLabels'

export function emptyInput(): SimpleCoachingInput {
  return { employeeName: '', coachingReason: '', notes: '' }
}

export function readWorkspaceFromStorage() {
  try {
    if (typeof localStorage === 'undefined') return null
    if (!localStorage.getItem(WORKSPACE_STORAGE_KEY)) return null
    return parseCoachingWorkspace(localStorage.getItem(WORKSPACE_STORAGE_KEY))
  } catch {
    return null
  }
}
