import type { CoachingWorkspace, FormMode, SimpleCoachingInput } from '../types/coaching'

export type CoachingTopicOption = {
  id: string
  label: string
  mode: FormMode
  input: SimpleCoachingInput
}

export type CoachingTopicGroup = { groupLabel: string; options: CoachingTopicOption[] }

const MOBILE_SALES_COACHING_TOPIC_GROUPS: CoachingTopicGroup[] = [
  {
    groupLabel: 'Metrics & common',
    options: [
      {
        id: 'late-shift',
        label: 'Late to shift',
        mode: 'coaching',
        input: {
          employeeName: 'Mobile Expert',
          coachingReason: 'Late to shift',
          notes: 'Discuss punctuality and on-time arrival.',
        },
      },
      {
        id: 'low-aps',
        label: 'Low APS',
        mode: 'coaching',
        input: {
          employeeName: 'Mobile Expert',
          coachingReason: 'Low APS (Attempts Per Shift)',
          notes: 'Add current APS and goal if known. Focus on getting customers to the tablet for eligibility.',
        },
      },
      {
        id: 'high-hpa',
        label: 'High HPA',
        mode: 'coaching',
        input: {
          employeeName: 'Mobile Expert',
          coachingReason: 'High HPA (Hours Per Activation)',
          notes: 'Add numbers if known. High HPA = too long between postpaid activations.',
        },
      },
      {
        id: 'high-mpt',
        label: 'High MPT',
        mode: 'coaching',
        input: {
          employeeName: 'Mobile Expert',
          coachingReason: 'High MPT (Minutes Per Transaction)',
          notes: 'Add context if known. High MPT = too much gap between customer interactions.',
        },
      },
      {
        id: 'not-engaging',
        label: 'Not engaging customers',
        mode: 'coaching',
        input: {
          employeeName: 'Mobile Expert',
          coachingReason: 'Not engaging customers on the sales floor',
          notes: 'Describe what you observed (approach, acknowledgment, handoffs).',
        },
      },
      {
        id: 'misuse-keys',
        label: 'Misuse of keys',
        mode: 'coaching',
        input: {
          employeeName: 'Mobile Expert',
          coachingReason: 'Misuse of keys / key control',
          notes: 'Brief facts: what happened and policy expectation.',
        },
      },
      {
        id: 'recognition-general',
        label: 'Recognition',
        mode: 'recognition',
        input: {
          employeeName: 'Mobile Expert',
          coachingReason: 'Strong performance — recognition',
          notes: 'What went well today (sales floor, customer experience, activations, etc.).',
        },
      },
    ],
  },
  {
    groupLabel: 'More topics',
    options: [
      {
        id: 'low-accessory-sales',
        label: 'Low accessory sales',
        mode: 'coaching',
        input: {
          employeeName: 'Mobile Expert',
          coachingReason: 'Low accessory sales',
          notes: 'Add attach rate or revenue context and goal if known.',
        },
      },
      {
        id: 'attendance',
        label: 'Attendance',
        mode: 'coaching',
        input: {
          employeeName: 'Mobile Expert',
          coachingReason: 'Attendance / punctuality',
          notes: 'Dates, pattern, and policy reminder as needed.',
        },
      },
      {
        id: 'not-hitting-goal',
        label: 'Not hitting goal',
        mode: 'coaching',
        input: {
          employeeName: 'Mobile Expert',
          coachingReason: 'Not hitting goal (sales or metrics)',
          notes: 'Which metric, current vs goal, and next steps.',
        },
      },
      {
        id: 'customer-experience',
        label: 'Customer experience',
        mode: 'coaching',
        input: {
          employeeName: 'Mobile Expert',
          coachingReason: 'Customer experience',
          notes: 'Observations, feedback, and expectations.',
        },
      },
      {
        id: 'low-conversion',
        label: 'Low conversion',
        mode: 'coaching',
        input: {
          employeeName: 'Mobile Expert',
          coachingReason: 'Low conversion',
          notes: 'Where in the funnel; numbers if known.',
        },
      },
      {
        id: 'needs-confidence',
        label: 'Needs confidence',
        mode: 'coaching',
        input: {
          employeeName: 'Mobile Expert',
          coachingReason: 'Needs confidence on the sales floor',
          notes: 'Specific situations to build on.',
        },
      },
      {
        id: 'uniform',
        label: 'Uniform',
        mode: 'coaching',
        input: {
          employeeName: 'Mobile Expert',
          coachingReason: 'Uniform / dress code',
          notes: 'What was out of compliance and standard expectation.',
        },
      },
      {
        id: 'keys-general',
        label: 'Keys',
        mode: 'coaching',
        input: {
          employeeName: 'Mobile Expert',
          coachingReason: 'Keys / key control',
          notes: 'Brief facts and policy expectation.',
        },
      },
      {
        id: 'recognition-great-sales-day',
        label: 'Recognition: Great sales day',
        mode: 'recognition',
        input: {
          employeeName: 'Mobile Expert',
          coachingReason: 'Great sales day — recognition',
          notes: 'Specific wins to celebrate.',
        },
      },
    ],
  },
]

/** General workplace quick topics — separate catalog from mobile sales. */
const GENERAL_WORKPLACE_COACHING_TOPIC_GROUPS: CoachingTopicGroup[] = [
  {
    groupLabel: 'Workplace essentials',
    options: [
      {
        id: 'wp-attendance',
        label: 'Attendance',
        mode: 'coaching',
        input: {
          employeeName: 'Team member',
          coachingReason: 'Attendance / punctuality',
          notes: 'Dates, pattern, and expectations.',
        },
      },
      {
        id: 'wp-professionalism',
        label: 'Professionalism',
        mode: 'coaching',
        input: {
          employeeName: 'Team member',
          coachingReason: 'Professionalism / conduct',
          notes: 'What was observed and the standard you expect.',
        },
      },
      {
        id: 'wp-customer-service',
        label: 'Customer service',
        mode: 'coaching',
        input: {
          employeeName: 'Team member',
          coachingReason: 'Customer or guest service',
          notes: 'Interaction, tone, or resolution issue — be specific.',
        },
      },
      {
        id: 'wp-teamwork',
        label: 'Teamwork',
        mode: 'coaching',
        input: {
          employeeName: 'Team member',
          coachingReason: 'Teamwork / collaboration',
          notes: 'How it affected handoffs, coverage, or morale.',
        },
      },
      {
        id: 'wp-accountability',
        label: 'Accountability',
        mode: 'coaching',
        input: {
          employeeName: 'Team member',
          coachingReason: 'Accountability / follow-through',
          notes: 'Missed commitments, incomplete tasks, or ownership gaps.',
        },
      },
      {
        id: 'wp-communication',
        label: 'Communication',
        mode: 'coaching',
        input: {
          employeeName: 'Team member',
          coachingReason: 'Communication',
          notes: 'Updates, tone, responsiveness, or clarity issues.',
        },
      },
      {
        id: 'wp-productivity',
        label: 'Productivity',
        mode: 'coaching',
        input: {
          employeeName: 'Team member',
          coachingReason: 'Productivity / workload',
          notes: 'Throughput, deadlines, focus, or prioritization.',
        },
      },
      {
        id: 'wp-leadership',
        label: 'Leadership',
        mode: 'coaching',
        input: {
          employeeName: 'Team member',
          coachingReason: 'Leadership expectations',
          notes: 'Coaching peers, tone when leading, or delegation.',
        },
      },
      {
        id: 'wp-policy',
        label: 'Policy compliance',
        mode: 'coaching',
        input: {
          employeeName: 'Team member',
          coachingReason: 'Policy / safety compliance',
          notes: 'Which policy, what happened, and required standard.',
        },
      },
      {
        id: 'wp-recognition',
        label: 'Recognition',
        mode: 'recognition',
        input: {
          employeeName: 'Team member',
          coachingReason: 'Strong contribution — recognition',
          notes: 'What went well today (service, teamwork, reliability, etc.).',
        },
      },
    ],
  },
  {
    groupLabel: 'More topics',
    options: [
      {
        id: 'wp-uniform',
        label: 'Dress code / appearance',
        mode: 'coaching',
        input: {
          employeeName: 'Team member',
          coachingReason: 'Dress code / appearance',
          notes: 'What was out of standard and the expectation.',
        },
      },
      {
        id: 'wp-conflict',
        label: 'Workplace conduct',
        mode: 'coaching',
        input: {
          employeeName: 'Team member',
          coachingReason: 'Workplace conduct',
          notes: 'Facts only; keep proportional to the situation described.',
        },
      },
      {
        id: 'wp-quality',
        label: 'Quality of work',
        mode: 'coaching',
        input: {
          employeeName: 'Team member',
          coachingReason: 'Quality of work',
          notes: 'Errors, rework, or attention to detail.',
        },
      },
      {
        id: 'wp-safety',
        label: 'Safety',
        mode: 'coaching',
        input: {
          employeeName: 'Team member',
          coachingReason: 'Safety concern',
          notes: 'What was observed and the safe standard.',
        },
      },
      {
        id: 'wp-recognition-lead',
        label: 'Recognition: leadership moment',
        mode: 'recognition',
        input: {
          employeeName: 'Team member',
          coachingReason: 'Leadership moment — recognition',
          notes: 'How they stepped up for the team.',
        },
      },
    ],
  },
]

export const WORKSPACE_TOPIC_GROUPS: Record<CoachingWorkspace, CoachingTopicGroup[]> = {
  mobile_sales: MOBILE_SALES_COACHING_TOPIC_GROUPS,
  general_workplace: GENERAL_WORKPLACE_COACHING_TOPIC_GROUPS,
}

export function coachingTopicOptionById(workspace: CoachingWorkspace, id: string): CoachingTopicOption | undefined {
  for (const g of WORKSPACE_TOPIC_GROUPS[workspace]) {
    const hit = g.options.find((o) => o.id === id)
    if (hit) return hit
  }
  return undefined
}
