import type { CoachingWorkspace } from '../types/profile'

/** localStorage key — must match CoachingApp / AccountSettings usage */
export const WORKSPACE_STORAGE_KEY = 'trackora_coaching_workspace'

export const WORKSPACE_LABEL: Record<CoachingWorkspace, string> = {
  mobile_sales: 'Mobile Sales Coaching',
  general_workplace: 'General Workplace Coaching',
}
