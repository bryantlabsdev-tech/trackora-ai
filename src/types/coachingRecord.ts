export type CoachingRecordStatus = 'Draft' | 'Shared' | 'Completed' | 'Follow-up Needed'

export type CoachingRecord = {
  id: string
  employee_name: string
  role: string
  coaching_type: string
  coaching_workspace: 'mobile_sales' | 'general_workplace'
  mode: 'coaching' | 'recognition'
  coaching_reason: string
  notes: string
  generated_form: string
  metric_focus: 'aps' | 'hpa' | 'mpt' | null
  metric_snapshot: Record<string, unknown>
  status: CoachingRecordStatus
  follow_up_due_at: string | null
  follow_up_completed_at: string | null
  created_at: string
  updated_at: string
}

