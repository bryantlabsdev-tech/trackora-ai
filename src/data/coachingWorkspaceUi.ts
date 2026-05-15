import type { CoachingWorkspace } from '../types/coaching'

export const WORKSPACE_UI: Record<
  CoachingWorkspace,
  {
    ledePrimary: string
    ledeTrust: string
    quickTopicsLabel: string
    reasonPlaceholder: string
    notesPlaceholder: string
    generateButtonIdle: string
    outputLoadingCaption: string
    outputEmptySub: string
    freeLimitBody: string
  }
> = {
  mobile_sales: {
    ledePrimary: 'Generate professional sales coaching and recognition forms.',
    ledeTrust: 'Built for retail leaders and fast-moving wireless teams.',
    quickTopicsLabel: 'Quick coaching topics',
    reasonPlaceholder: 'e.g. Low APS, high HPA — add numbers in notes',
    notesPlaceholder: 'Observations, context, numbers…',
    generateButtonIdle: 'Generate AI Coaching Form',
    outputLoadingCaption: 'Generating professional coaching form...',
    outputEmptySub:
      'Fill out the details and generate a professional coaching or recognition form instantly.',
    freeLimitBody:
      'Upgrade to Pro for unlimited coaching form generations, monthly AI section refinements, and professional retail-ready drafts.',
  },
  general_workplace: {
    ledePrimary: 'Generate professional workplace coaching and feedback forms.',
    ledeTrust: 'Built for supervisors across offices, service, operations, and the floor.',
    quickTopicsLabel: 'Quick workplace topics',
    reasonPlaceholder: 'e.g. Late returns from break, missed deadline — add dates in notes',
    notesPlaceholder: 'Observations, context, policy references…',
    generateButtonIdle: 'Generate AI Coaching Form',
    outputLoadingCaption: 'Generating professional workplace coaching form...',
    outputEmptySub:
      'Fill out the details and generate a professional coaching or recognition form instantly.',
    freeLimitBody:
      'Upgrade to Pro for unlimited coaching form generations, monthly AI section refinements, and professional workplace-ready drafts.',
  },
}
