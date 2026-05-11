import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CoachingApiError, FreeLimitReachedError, requestCoachingLog } from './api/requestCoachingLog'
import {
  RefinementMonthlyLimitError,
  RefinementRequiresProError,
  requestRefineSection,
} from './api/requestRefineSection'
import { useProfile } from './context/ProfileContext'
import { usePostTutorialFeedbackNudge } from './context/PostTutorialFeedbackNudgeContext'
import type {
  CoachingFormSectionLabel,
  CoachingLogApiPayload,
  CoachingWorkspace,
  FormMode,
  RefinePreset,
  SimpleCoachingInput,
} from './types/coaching'
import { COACHING_FORM_SECTION_LABELS } from './types/coaching'
import {
  FREE_AI_GENERATION_LIMIT,
  PRO_MONTHLY_REFINEMENT_LIMIT,
  canUseAiGeneration,
  freeGenerationsRemaining,
  getRefinementQuotaForProfile,
  hasPremiumAccess,
  isElitePlan,
  isFreeLimitReached,
  isFreePlan,
  isOwnerFreePro,
  isProPlan,
} from './types/profile'
import { parseCoachingWorkspace } from '../shared/coachingWorkspace.mjs'
import { persistCoachingWorkspace } from './lib/profileApi'
import { supabase } from './lib/supabase'
import { WORKSPACE_LABEL, WORKSPACE_STORAGE_KEY } from './lib/workspaceLabels'
import {
  copyPlainTextToClipboard,
  formatCoachingFormForClipboard,
  formatSectionClipboardBlock,
  sectionClipboardHasContent,
} from './lib/formatCoachingFormClipboard'
import { mergeRefinedSectionIntoLog } from './lib/mergeRefinedSection'
import { parseCoachingLogMarkdown } from './lib/parseCoachingLog'
import { startEliteUpgrade } from './api/startEliteUpgrade'
import { getCreateCheckoutSessionUrl } from './lib/apiBase'
import './App.css'

const ELITE_PRORATION_HINT =
  'Upgrade to Elite — you\u2019ll only pay the prorated difference today.'

type UpgradeToProButtonProps = {
  userId: string
  email: string
  /** Defaults to "Upgrade to Pro" — use "Unlock Pro" on free-limit surfaces */
  ctaLabel?: string
  checkoutPlan?: 'pro' | 'elite'
  variant?: 'primary' | 'outline'
  /** After Pro → Elite proration upgrade succeeds (same subscription). */
  onBillingUpdated?: () => void
}

function UpgradeToProButton({
  userId,
  email,
  ctaLabel,
  checkoutPlan = 'pro',
  variant = 'primary',
  onBillingUpdated,
}: UpgradeToProButtonProps) {
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [eliteInfo, setEliteInfo] = useState<string | null>(null)

  async function startCheckout() {
    const trimmedUserId = userId.trim()
    if (import.meta.env.DEV) {
      console.log('[upgrade] checkout userId present:', Boolean(trimmedUserId))
    }

    if (!trimmedUserId) {
      setCheckoutError('Could not start checkout: missing user id. Please sign in again.')
      return
    }

    setCheckoutError(null)
    setEliteInfo(null)
    setCheckoutLoading(true)
    try {
      if (checkoutPlan === 'elite') {
        const result = await startEliteUpgrade()
        if (!result.ok) {
          setCheckoutError(result.error || 'Could not start Elite upgrade.')
          return
        }
        if (result.mode === 'checkout' && result.url) {
          window.location.href = result.url
          return
        }
        if (result.mode === 'subscription_updated') {
          onBillingUpdated?.()
          setEliteInfo('You\u2019re on Elite now. Your subscription was updated in place.')
          return
        }
        if (result.mode === 'already_elite') {
          setEliteInfo(result.message || 'You\u2019re already on Elite.')
          return
        }
        setCheckoutError('Unexpected response from billing.')
        return
      }

      const payload = {
        userId: trimmedUserId,
        email: email.trim(),
        planTier: checkoutPlan,
      }

      const res = await fetch(getCreateCheckoutSessionUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok) {
        setCheckoutError(data.error || 'Could not start checkout.')
        return
      }
      if (!data.url) {
        setCheckoutError('No checkout URL returned.')
        return
      }
      window.location.href = data.url
    } catch {
      setCheckoutError('Network error. Try again.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  const btnClass =
    variant === 'outline'
      ? 'btn-secondary btn-plan-upgrade btn-plan-upgrade--outline'
      : 'btn-primary btn-plan-upgrade'

  return (
    <div className="upgrade-checkout-wrap">
      <button
        type="button"
        className={btnClass}
        disabled={checkoutLoading}
        onClick={() => void startCheckout()}
      >
        {checkoutLoading && <span className="spinner" aria-hidden />}
        {checkoutLoading ? 'Opening checkout…' : (ctaLabel ?? 'Upgrade to Pro')}
      </button>
      {checkoutPlan === 'elite' && (
        <p className="plan-elite-proration-hint" role="note">
          {ELITE_PRORATION_HINT}
        </p>
      )}
      {eliteInfo && (
        <p className="settings-note upgrade-checkout-info" role="status">
          {eliteInfo}
        </p>
      )}
      {checkoutError && (
        <p className="auth-error upgrade-checkout-error" role="alert">
          {checkoutError}
        </p>
      )}
    </div>
  )
}

const SESSION_WARMUP_TIP_KEY = 'trackora_warmup_tip_shown'
const SESSION_PAYWALL_SHOWN_KEY = 'trackora_paywall_shown_this_session'

/** Free-tier exhausted: headline + body (typographic apostrophe in “You’ve” for web/mobile). */
const FREE_LIMIT_HEADLINE = 'You\u2019ve reached the free limit'

const PAYWALL_PRO_BULLETS = [
  'Unlimited coaching forms',
  '25 AI section refinements monthly',
  'Professional coaching + recognition drafts',
] as const

const PAYWALL_ELITE_BULLETS = [
  'Unlimited coaching forms',
  'Unlimited AI refinements',
  'Future premium workflow features included',
  'Built for power users and leaders who refine often',
] as const

/** Pricing modal (full copy per product spec). */
const PRICING_MODAL_FREE_BULLETS = ['3 coaching generations', 'No AI refinements'] as const

const PRICING_MODAL_PRO_BULLETS = [
  'Unlimited coaching forms',
  '25 AI refinements monthly',
  'Coaching + recognition drafts',
] as const

const PRICING_MODAL_ELITE_BULLETS = [
  'Unlimited coaching forms',
  'Unlimited AI refinements',
  'Built for power users',
  'Future workflow features',
] as const

const REFINEMENT_LIMIT_HEADLINE = 'You\u2019ve reached your monthly refinement limit.'
const REFINEMENT_LIMIT_SUBTEXT =
  'Upgrade to Elite ($11.99/month) for unlimited AI section refinements and future workflow features.'

const TUTORIAL_SAMPLE: SimpleCoachingInput = {
  employeeName: 'Alex Rivera',
  coachingReason: 'Late to opening shift twice this week',
  notes: 'Arrived 10+ minutes after start time.',
}

type TutorialPhase = 'off' | 'walkthrough' | 'spotlight_generate' | 'spotlight_output'

type TutorialStep = { title: string; body: string; support?: string }

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Create professional coaching forms in seconds',
    body: 'Start with the employee name and what the coaching conversation is about.',
  },
  {
    title: 'Move faster with quick topics',
    body: 'Pick a topic from the menu to pre-fill the form — then edit anything before you generate.',
  },
  {
    title: 'Generate your full form',
    body: 'Tap Generate and get a structured, ready-to-use coaching or recognition form.',
  },
  {
    title: 'Try it free',
    body: 'You get three free AI generations to see how Trackora fits your workflow — no commitment.',
  },
  {
    title: 'We’re listening',
    body: 'Something feel off? Tap Feedback anytime — we read every note and use it to improve.',
    support: 'Your feedback stays private to our team.',
  },
  {
    title: 'Unlock unlimited when you’re ready',
    body: 'Choose Pro or Elite for unlimited coaching forms; Elite adds unlimited refinements for teams that iterate often.',
  },
]

type CoachingTopicOption = {
  id: string
  label: string
  mode: FormMode
  input: SimpleCoachingInput
}

type CoachingTopicGroup = { groupLabel: string; options: CoachingTopicOption[] }

/** Single source for the Quick coaching topics dropdown; always fills Mobile Expert + reason/notes + mode. */
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

const WORKSPACE_TOPIC_GROUPS: Record<CoachingWorkspace, CoachingTopicGroup[]> = {
  mobile_sales: MOBILE_SALES_COACHING_TOPIC_GROUPS,
  general_workplace: GENERAL_WORKPLACE_COACHING_TOPIC_GROUPS,
}

function coachingTopicOptionById(workspace: CoachingWorkspace, id: string): CoachingTopicOption | undefined {
  for (const g of WORKSPACE_TOPIC_GROUPS[workspace]) {
    const hit = g.options.find((o) => o.id === id)
    if (hit) return hit
  }
  return undefined
}

function readWorkspaceFromStorage(): CoachingWorkspace | null {
  try {
    if (typeof localStorage === 'undefined') return null
    if (!localStorage.getItem(WORKSPACE_STORAGE_KEY)) return null
    return parseCoachingWorkspace(localStorage.getItem(WORKSPACE_STORAGE_KEY))
  } catch {
    return null
  }
}

const WORKSPACE_UI: Record<
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

/** Premium document headings (parsed section `id` matches model labels). */
const DOCUMENT_SECTION_DISPLAY: Record<string, string> = {
  'Pre-Coaching Notes': 'PRE-COACHING NOTES',
  'Coaching Category': 'COACHING CATEGORY',
  Situation: 'SITUATION',
  Behavior: 'BEHAVIOR',
  Impact: 'IMPACT',
  'Next Steps': 'NEXT STEPS',
  'Manager Follow-Up': 'MANAGER FOLLOW-UP',
  'Coaching form': 'COACHING FORM',
}

function documentSectionTitle(sectionId: string): string {
  return DOCUMENT_SECTION_DISPLAY[sectionId] ?? sectionId.replace(/\s+/g, ' ').trim().toUpperCase()
}

function formatGenerationBadgeLabel(
  ms: number,
  source: 'openai' | 'deterministic' | 'fallback' | null,
): string {
  if (source === 'openai' && ms < 1500) return 'Instant'
  const s = (ms / 1000).toFixed(1)
  return source === 'deterministic' ? `Prepared in ${s}s` : `Generated in ${s}s`
}

function OutputNextStepsBody({ body }: { body: string }) {
  const raw = body.trim()
  if (!raw) {
    return <span className="output-doc-empty">—</span>
  }
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const items = lines
    .map((line) => line.replace(/^[•\-\*]\s*/, '').replace(/^\d+[.)]\s+/, '').trim())
    .filter(Boolean)
  if (items.length === 0) {
    return <div className="output-doc-text">{body}</div>
  }
  return (
    <ul className="output-doc-bullets">
      {items.map((text, i) => (
        <li key={i}>{text}</li>
      ))}
    </ul>
  )
}

const REFINABLE_SECTION_IDS = new Set<string>(COACHING_FORM_SECTION_LABELS)

const REFINE_QUICK_OPTIONS: { preset: RefinePreset; label: string }[] = [
  { preset: 'softer', label: 'Make softer' },
  { preset: 'more_direct', label: 'Make more direct' },
  { preset: 'professional', label: 'Make more professional' },
  { preset: 'shorten', label: 'Shorten' },
  { preset: 'expand', label: 'Expand' },
  { preset: 'clearer_expectations', label: 'Clearer expectations' },
]

function SectionCopyIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg className="btn-section-copy-icon-svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <path
          fill="currentColor"
          d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06l2.72 2.72 6.72-6.72a.75.75 0 0 1 1.06 0z"
        />
      </svg>
    )
  }
  return (
    <svg className="btn-section-copy-icon-svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path
        fill="currentColor"
        d="M4 2h7a2 2 0 0 1 2 2v7h-1.5V4a.5.5 0 0 0-.5-.5H4V2zm-2 2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 1.5a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V6a.5.5 0 0 0-.5-.5H2z"
      />
    </svg>
  )
}

function emptyInput(): SimpleCoachingInput {
  return { employeeName: '', coachingReason: '', notes: '' }
}

export default function CoachingApp() {
  const {
    profile,
    loading: profileLoading,
    error: profileError,
    applyUsageSnapshot,
    applyRefinementSnapshot,
    completeTutorial,
    refresh,
  } = useProfile()
  const { triggerPostTutorialFeedbackNudge } = usePostTutorialFeedbackNudge()
  const [input, setInput] = useState<SimpleCoachingInput>(emptyInput)
  const [formMode, setFormMode] = useState<FormMode>('coaching')
  const [coachingWorkspace, setCoachingWorkspace] = useState<CoachingWorkspace>('mobile_sales')
  const [quickTopicSelection, setQuickTopicSelection] = useState('')
  const [showValidation, setShowValidation] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [logText, setLogText] = useState<string | null>(null)
  const [logSource, setLogSource] = useState<'openai' | 'deterministic' | 'fallback' | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastGenerationMs, setLastGenerationMs] = useState<number | null>(null)
  const [showLimitPaywall, setShowLimitPaywall] = useState(false)
  const [showRefinementLimitModal, setShowRefinementLimitModal] = useState(false)
  const [showPricingModal, setShowPricingModal] = useState(false)
  /** Per-section copy feedback, keyed by `${sec.id}-${index}` */
  const [copiedSectionKeys, setCopiedSectionKeys] = useState<Record<string, boolean>>({})
  const [showWarmupNotice, setShowWarmupNotice] = useState(false)
  /** If sessionStorage is blocked, still only show the tip once per tab load */
  const warmupFallbackUsedRef = useRef(false)
  const [tutorialPhase, setTutorialPhase] = useState<TutorialPhase>('off')
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0)
  const tutorialPhaseRef = useRef<TutorialPhase>('off')
  const generateBtnRef = useRef<HTMLButtonElement>(null)
  const outputCardRef = useRef<HTMLElement>(null)
  const [outputHelpfulness, setOutputHelpfulness] = useState<'yes' | 'no' | null>(null)
  const [copyFormToast, setCopyFormToast] = useState(false)
  const [copyEntireSuccess, setCopyEntireSuccess] = useState(false)
  const [refineOpenRowKey, setRefineOpenRowKey] = useState<string | null>(null)
  const [refinePresetPick, setRefinePresetPick] = useState<RefinePreset | null>(null)
  const [refineCustomText, setRefineCustomText] = useState('')
  const [refiningRowKey, setRefiningRowKey] = useState<string | null>(null)
  const [refinedFlashKeys, setRefinedFlashKeys] = useState<Record<string, boolean>>({})
  const [tutorialDismissBusy, setTutorialDismissBusy] = useState(false)
  const [tutorialDismissError, setTutorialDismissError] = useState<string | null>(null)
  const tutorialDismissBusyRef = useRef(false)
  const coachingWorkspaceRef = useRef<CoachingWorkspace>(coachingWorkspace)
  coachingWorkspaceRef.current = coachingWorkspace

  const resetWorkspaceScopedFormState = useCallback(() => {
    setInput(emptyInput())
    setFormMode('coaching')
    setQuickTopicSelection('')
    setShowValidation(false)
    setGenerationError(null)
    setLogText(null)
    setLogSource(null)
    setLastGenerationMs(null)
    setOutputHelpfulness(null)
    setCopiedSectionKeys({})
    setRefineOpenRowKey(null)
    setRefinePresetPick(null)
    setRefineCustomText('')
    setRefinedFlashKeys({})
    setCopyFormToast(false)
    setCopyEntireSuccess(false)
  }, [])

  useEffect(() => {
    tutorialPhaseRef.current = tutorialPhase
  }, [tutorialPhase])

  useEffect(() => {
    if (profileLoading || !profile) return
    if (profile.needs_coaching_workspace_setup) return
    // Supabase `has_seen_tutorial` is the source of truth (see mark_tutorial_seen / reset_tutorial_for_replay).
    if (!profile.has_seen_tutorial) {
      setTutorialPhase((p) => {
        if (p === 'walkthrough' || p === 'spotlight_generate' || p === 'spotlight_output') return p
        return 'walkthrough'
      })
    } else {
      setTutorialPhase((p) => (p === 'spotlight_output' ? p : 'off'))
    }
  }, [profileLoading, profile?.has_seen_tutorial, profile?.needs_coaching_workspace_setup])

  useEffect(() => {
    if (tutorialPhase !== 'walkthrough') return
    setTutorialStepIndex(0)
    setLogText(null)
    setLogSource(null)
    setLastGenerationMs(null)
  }, [tutorialPhase])

  useEffect(() => {
    if (profile && hasPremiumAccess(profile)) setShowLimitPaywall(false)
  }, [profile])

  useEffect(() => {
    if (profileLoading || !profile) return
    if (profile.needs_coaching_workspace_setup) {
      setCoachingWorkspace(profile.coaching_workspace)
      return
    }
    const fromLs = readWorkspaceFromStorage()
    const resolved = fromLs ?? profile.coaching_workspace
    const local = coachingWorkspaceRef.current
    if (resolved !== local) {
      resetWorkspaceScopedFormState()
      setCoachingWorkspace(resolved)
    }
    if (fromLs && fromLs !== profile.coaching_workspace && supabase) {
      void persistCoachingWorkspace(supabase, fromLs).then((r) => {
        if (r.ok) void refresh()
      })
    }
  }, [
    profileLoading,
    profile?.id,
    profile?.coaching_workspace,
    profile?.needs_coaching_workspace_setup,
    refresh,
    resetWorkspaceScopedFormState,
  ])

  useEffect(() => {
    if (!quickTopicSelection) return
    if (!coachingTopicOptionById(coachingWorkspace, quickTopicSelection)) {
      setQuickTopicSelection('')
    }
  }, [coachingWorkspace, quickTopicSelection])

  const selectCoachingWorkspace = useCallback(
    async (next: CoachingWorkspace) => {
      const onboarding = profile?.needs_coaching_workspace_setup === true
      if (!onboarding && next === coachingWorkspace) return
      if (next !== coachingWorkspace || onboarding) {
        resetWorkspaceScopedFormState()
      }
      setCoachingWorkspace(next)
      try {
        localStorage.setItem(WORKSPACE_STORAGE_KEY, next)
      } catch {
        /* ignore */
      }
      if (supabase && profile?.id) {
        const r = await persistCoachingWorkspace(supabase, next)
        if (!r.ok) console.error('[workspace]', r.error)
        await refresh()
      }
    },
    [
      coachingWorkspace,
      profile?.id,
      profile?.needs_coaching_workspace_setup,
      refresh,
      resetWorkspaceScopedFormState,
    ],
  )

  const workspaceUI = WORKSPACE_UI[coachingWorkspace]

  const refinementQuota = useMemo(
    () => getRefinementQuotaForProfile(profile, profile?.email ?? null),
    [profile],
  )

  useEffect(() => {
    if (refinementQuota.canRefine) setShowRefinementLimitModal(false)
  }, [refinementQuota.canRefine])

  useEffect(() => {
    if (!showPricingModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPricingModal(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showPricingModal])

  const dismissTutorialChrome = useCallback(async () => {
    if (tutorialDismissBusyRef.current) return
    tutorialDismissBusyRef.current = true
    setTutorialDismissBusy(true)
    setTutorialDismissError(null)
    try {
      const ok = await completeTutorial()
      if (!ok) {
        setTutorialDismissError(
          'Could not save tutorial completion. Check your connection and try again — it may show again after refresh.',
        )
        return
      }
      setTutorialPhase('off')
    } finally {
      tutorialDismissBusyRef.current = false
      setTutorialDismissBusy(false)
    }
  }, [completeTutorial])

  useEffect(() => {
    if (tutorialPhase !== 'spotlight_output' || !logText) return
    const el = outputCardRef.current
    if (!el) return
    window.requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }, [tutorialPhase, logText])

  useEffect(() => {
    if (tutorialPhase !== 'spotlight_output') return
    const id = window.setTimeout(() => void dismissTutorialChrome(), 4200)
    return () => clearTimeout(id)
  }, [tutorialPhase, dismissTutorialChrome])

  const onTutorialStartGenerating = useCallback(() => {
    setInput(TUTORIAL_SAMPLE)
    setQuickTopicSelection('')
    setShowValidation(false)
    setTutorialPhase('spotlight_generate')
    window.requestAnimationFrame(() => {
      generateBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [])

  const onTutorialNext = useCallback(() => {
    setTutorialStepIndex((s) => Math.min(TUTORIAL_STEPS.length - 1, s + 1))
  }, [])

  const onTutorialBack = useCallback(() => {
    setTutorialStepIndex((s) => Math.max(0, s - 1))
  }, [])

  useEffect(() => {
    if (!showWarmupNotice) return
    const id = window.setTimeout(() => setShowWarmupNotice(false), 5000)
    return () => clearTimeout(id)
  }, [showWarmupNotice])

  const canGenerate = useMemo(() => {
    return input.employeeName.trim().length > 0 && input.coachingReason.trim().length > 0
  }, [input])

  const payload = useMemo((): CoachingLogApiPayload => {
    return {
      employeeName: input.employeeName.trim(),
      coachingReason: input.coachingReason.trim(),
      notes: input.notes.trim(),
      mode: formMode,
      coachingWorkspace,
    }
  }, [input, formMode, coachingWorkspace])

  type RunGenOpts = { isTutorialRun?: boolean; skipWarmup?: boolean }

  const runGeneration = useCallback(
    async (opts?: RunGenOpts) => {
      if (!canGenerate) {
        setShowValidation(true)
        return
      }
      const isTutorialRun =
        opts?.isTutorialRun !== undefined
          ? opts.isTutorialRun
          : tutorialPhaseRef.current === 'spotlight_generate'
      const skipWarmup = opts?.skipWarmup === true

      const blocked =
        profileLoading ||
        !profile ||
        (!isTutorialRun && !canUseAiGeneration(profile))
      const usageCount = profile?.usage_count ?? null
      const isPro = profile ? hasPremiumAccess(profile) : null
      const remainingForLog =
        profile && !hasPremiumAccess(profile) ? freeGenerationsRemaining(profile) : Number.POSITIVE_INFINITY
      if (import.meta.env.DEV) {
        console.log('[usage]', { isPro, usageCount, remainingForLog, blocked, isTutorialRun })
      }

      if (blocked) {
        if (tutorialPhaseRef.current === 'off' && profile && !hasPremiumAccess(profile) && isFreeLimitReached(profile)) {
          let alreadyShown = false
          try {
            alreadyShown =
              typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_PAYWALL_SHOWN_KEY) === '1'
          } catch {
            alreadyShown = false
          }
          if (!alreadyShown) {
            setShowLimitPaywall(true)
            try {
              if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(SESSION_PAYWALL_SHOWN_KEY, '1')
              }
            } catch {
              // ignore storage errors
            }
          }
        }
        return
      }
      setShowValidation(false)
      setGenerationError(null)
      setOutputHelpfulness(null)

      let shouldShowWarmupTip = false
      if (!skipWarmup) {
        try {
          if (typeof sessionStorage !== 'undefined') {
            if (!sessionStorage.getItem(SESSION_WARMUP_TIP_KEY)) {
              sessionStorage.setItem(SESSION_WARMUP_TIP_KEY, '1')
              shouldShowWarmupTip = true
            }
          } else if (!warmupFallbackUsedRef.current) {
            warmupFallbackUsedRef.current = true
            shouldShowWarmupTip = true
          }
        } catch {
          if (!warmupFallbackUsedRef.current) {
            warmupFallbackUsedRef.current = true
            shouldShowWarmupTip = true
          }
        }
        if (shouldShowWarmupTip) setShowWarmupNotice(true)
      }

      setLoading(true)
      const startedAt = Date.now()
      setLogText(null)
      setLogSource(null)
      setLastGenerationMs(null)
      setCopiedSectionKeys({})
      try {
        const result = await requestCoachingLog(payload, { isTutorialRun })
        setLogText(result.text)
        setLogSource(result.source)
        setLastGenerationMs(Date.now() - startedAt)
        if (result.usage && !isTutorialRun) {
          applyUsageSnapshot({
            usageCount: result.usage.usageCount,
            isPro: result.usage.isPro,
          })
        }

        const generationSuccessful = typeof result.text === 'string' && result.text.trim().length > 0
        if (generationSuccessful && tutorialPhaseRef.current === 'spotlight_generate') {
          const ok = await completeTutorial()
          if (!ok) console.error('[tutorial] could not persist tutorial completion / bonus')
          setTutorialPhase('spotlight_output')
          triggerPostTutorialFeedbackNudge()
        }
        if (generationSuccessful && !isTutorialRun) {
          await refresh()
        }
      } catch (err) {
        if (err instanceof FreeLimitReachedError) {
          setShowLimitPaywall(true)
          try {
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem(SESSION_PAYWALL_SHOWN_KEY, '1')
            }
          } catch {
            // ignore storage errors
          }
          return
        }
        if (err instanceof CoachingApiError) {
          setGenerationError(err.message || 'Could not generate right now. Please try again.')
          return
        }
        setGenerationError('Could not generate right now. Please try again.')
      } finally {
        setLoading(false)
        setShowWarmupNotice(false)
      }
    },
    [
      canGenerate,
      payload,
      profile,
      profileLoading,
      applyUsageSnapshot,
      completeTutorial,
      refresh,
      triggerPostTutorialFeedbackNudge,
      coachingWorkspace,
    ],
  )

  const generate = useCallback(() => void runGeneration(), [runGeneration])

  const regenerate = useCallback(() => {
    void runGeneration({ isTutorialRun: false, skipWarmup: true })
  }, [runGeneration])

  const copySection = useCallback(async (rowKey: string, sectionLabel: string, body: string) => {
    const plain = formatSectionClipboardBlock(sectionLabel, body)
    if (!plain) return

    const ok = await copyPlainTextToClipboard(plain)
    if (!ok) return

    setCopiedSectionKeys((m) => ({ ...m, [rowKey]: true }))
    window.setTimeout(() => {
      setCopiedSectionKeys((m) => ({ ...m, [rowKey]: false }))
    }, 1800)
  }, [])

  const parsedSections = useMemo(() => (logText ? parseCoachingLogMarkdown(logText) : []), [logText])

  const copyEntireForm = useCallback(async () => {
    if (!logText?.trim()) return
    const plain = formatCoachingFormForClipboard(parsedSections, logText)
    if (!plain.trim()) return
    const ok = await copyPlainTextToClipboard(plain)
    if (!ok) return
    setCopyEntireSuccess(true)
    window.setTimeout(() => setCopyEntireSuccess(false), 1600)
    setCopyFormToast(true)
    window.setTimeout(() => setCopyFormToast(false), 3200)
  }, [logText, parsedSections])

  const applySectionRefinement = useCallback(
    async (sectionId: CoachingFormSectionLabel, rowKey: string, currentBody: string) => {
      if (!logText?.trim()) return
      const preset = refinePresetPick
      const instruction = refineCustomText.trim()
      if (!preset && !instruction) {
        setGenerationError('Pick a quick refinement or add custom instructions.')
        return
      }
      setGenerationError(null)
      setRefiningRowKey(rowKey)
      try {
        const result = await requestRefineSection({
          sectionName: sectionId,
          sectionKey: sectionId,
          currentSectionText: currentBody,
          fullGeneratedForm: logText,
          refinementPreset: preset,
          refinementInstruction: instruction,
          mode: formMode,
          employeeName: input.employeeName,
          coachingFor: input.coachingReason,
          coachingWorkspace,
        })
        setLogText(mergeRefinedSectionIntoLog(logText, sectionId, result.refinedText))
        if (result.usage) {
          applyUsageSnapshot({
            usageCount: result.usage.usageCount,
            isPro: result.usage.isPro,
          })
        }
        if (result.refinementSnapshot) {
          applyRefinementSnapshot(result.refinementSnapshot)
        }
        setRefineOpenRowKey(null)
        setRefinePresetPick(null)
        setRefineCustomText('')
        setRefinedFlashKeys((m) => ({ ...m, [rowKey]: true }))
        window.setTimeout(() => {
          setRefinedFlashKeys((m) => {
            const next = { ...m }
            delete next[rowKey]
            return next
          })
        }, 2200)
      } catch (err) {
        if (err instanceof FreeLimitReachedError) {
          setShowLimitPaywall(true)
          try {
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem(SESSION_PAYWALL_SHOWN_KEY, '1')
            }
          } catch {
            /* ignore */
          }
          return
        }
        if (err instanceof RefinementMonthlyLimitError) {
          setShowRefinementLimitModal(true)
          return
        }
        if (err instanceof RefinementRequiresProError) {
          setShowLimitPaywall(true)
          return
        }
        if (err instanceof CoachingApiError) {
          setGenerationError(err.message)
          return
        }
        setGenerationError('Could not refine this section. Please try again.')
      } finally {
        setRefiningRowKey(null)
      }
    },
    [
      logText,
      refinePresetPick,
      refineCustomText,
      formMode,
      input.employeeName,
      applyUsageSnapshot,
      applyRefinementSnapshot,
      coachingWorkspace,
    ],
  )

  const applyQuickTopicById = useCallback(
    (id: string) => {
      const opt = coachingTopicOptionById(coachingWorkspace, id)
      if (!opt) return
      setFormMode(opt.mode)
      setInput(opt.input)
      setShowValidation(false)
    },
    [coachingWorkspace],
  )

  const onQuickTopicChange = useCallback(
    (value: string) => {
      setQuickTopicSelection(value)
      if (!value) return
      applyQuickTopicById(value)
    },
    [applyQuickTopicById],
  )

  const invalidName = showValidation && !input.employeeName.trim()
  const invalidReason = showValidation && !input.coachingReason.trim()

  const workspaceGateOpen = Boolean(!profileLoading && profile?.needs_coaching_workspace_setup)

  const generationBlocked =
    profileLoading ||
    !profile ||
    workspaceGateOpen ||
    (!canUseAiGeneration(profile) && tutorialPhase !== 'spotlight_generate')
  const tutorialStep = TUTORIAL_STEPS[tutorialStepIndex]
  const tutorialHighlightQuickTopics = tutorialPhase === 'walkthrough' && tutorialStepIndex === 1
  const tutorialHighlightGenerate =
    tutorialPhase === 'spotlight_generate' || (tutorialPhase === 'walkthrough' && tutorialStepIndex === 2)

  return (
    <div className="app" data-mobile-sticky-gen={tutorialPhase === 'off' ? 'on' : 'off'}>
      {workspaceGateOpen && (
        <div
          className="workspace-gate-root"
          role="dialog"
          aria-modal="true"
          aria-labelledby="workspace-gate-title"
        >
          <div className="workspace-gate-backdrop" aria-hidden />
          <div className="workspace-gate-card card">
            <p className="workspace-gate-kicker">Get started</p>
            <h2 id="workspace-gate-title" className="workspace-gate-title">
              Choose your coaching workspace
            </h2>
            <p className="workspace-gate-lede">
              Trackora adapts topics, tone, and examples to your team. You can change this anytime in Settings.
            </p>
            <div className="workspace-picker-grid workspace-picker-grid--gate">
              <button
                type="button"
                className={
                  'workspace-card' + (coachingWorkspace === 'mobile_sales' ? ' workspace-card--active' : '')
                }
                aria-pressed={coachingWorkspace === 'mobile_sales'}
                onClick={() => void selectCoachingWorkspace('mobile_sales')}
              >
                <span className="workspace-card-icon" aria-hidden>
                  📱
                </span>
                <span className="workspace-card-title">{WORKSPACE_LABEL.mobile_sales}</span>
                <span className="workspace-card-desc">Wireless retail, metrics, floor coaching</span>
              </button>
              <button
                type="button"
                className={
                  'workspace-card' +
                  (coachingWorkspace === 'general_workplace' ? ' workspace-card--active' : '')
                }
                aria-pressed={coachingWorkspace === 'general_workplace'}
                onClick={() => void selectCoachingWorkspace('general_workplace')}
              >
                <span className="workspace-card-icon" aria-hidden>
                  🧑‍💼
                </span>
                <span className="workspace-card-title">{WORKSPACE_LABEL.general_workplace}</span>
                <span className="workspace-card-desc">Offices, service, warehouses, and more</span>
              </button>
            </div>
            <p className="workspace-gate-foot">Tap a card to continue</p>
          </div>
        </div>
      )}
      {tutorialPhase === 'spotlight_generate' && <div className="tutorial-dim" aria-hidden />}
      <header className="header">
        <p className="eyebrow">Trackora</p>
        <h1>Coaching form</h1>
        <p className="lede">
          <span className="lede-line">{workspaceUI.ledePrimary}</span>
          <span className="lede-line lede-line--trust">{workspaceUI.ledeTrust}</span>
        </p>
      </header>

      <div className="layout">
        <section className="card input-card">
          <h2 className="card-title">Details</h2>
          {profileError && (
            <p className="plan-profile-error" role="alert">
              {profileError}
            </p>
          )}
          {profileLoading && (
            <p className="plan-loading" role="status">
              Loading your plan…
            </p>
          )}
          {profile && !profileLoading && (
            <div
              className={
                'plan-status-banner' +
                (isElitePlan(profile, profile.email)
                  ? ' plan-status-banner--elite'
                  : hasPremiumAccess(profile)
                    ? ' plan-status-banner--pro'
                    : ' plan-status-banner--free')
              }
              aria-live="polite"
            >
              {!hasPremiumAccess(profile) ? (
                <>
                  <div className="plan-status-banner-text">
                    <span className="plan-status-banner-title">Free plan</span>
                    <span className="plan-status-banner-sub">
                      {FREE_AI_GENERATION_LIMIT} generations included
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary plan-status-banner-cta"
                    onClick={() => setShowPricingModal(true)}
                  >
                    View plans
                  </button>
                </>
              ) : isElitePlan(profile, profile.email) ? (
                <div className="plan-status-banner-text plan-status-banner-text--full">
                  <span className="plan-status-banner-title">Elite plan active</span>
                  <span className="plan-status-banner-sub">Unlimited refinements</span>
                  {isOwnerFreePro(profile.email) ? (
                    <span className="plan-status-banner-founder">Founder access</span>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="plan-status-banner-text">
                    <span className="plan-status-banner-title">Pro plan active</span>
                    <span className="plan-status-banner-sub">
                      {PRO_MONTHLY_REFINEMENT_LIMIT} refinements/month
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-primary plan-status-banner-cta"
                    onClick={() => setShowPricingModal(true)}
                  >
                    Upgrade to Elite
                  </button>
                </>
              )}
            </div>
          )}
          <label className={'field' + (tutorialHighlightQuickTopics ? ' tutorial-field-highlight' : '')}>
            <span className="label-text">{workspaceUI.quickTopicsLabel}</span>
            <select
              className={'field-control' + (tutorialHighlightQuickTopics ? ' is-tutorial-focus' : '')}
              value={quickTopicSelection}
              onChange={(e) => onQuickTopicChange(e.target.value)}
              aria-label={workspaceUI.quickTopicsLabel}
            >
              <option value="">Select a quick topic...</option>
              {WORKSPACE_TOPIC_GROUPS[coachingWorkspace].map((g) => (
                <optgroup key={g.groupLabel} label={g.groupLabel}>
                  {g.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="mode-toggle" role="group" aria-label="Form type">
            <button
              type="button"
              className={'mode-option' + (formMode === 'coaching' ? ' is-active' : '')}
              aria-pressed={formMode === 'coaching'}
              onClick={() => setFormMode('coaching')}
            >
              Coaching
            </button>
            <button
              type="button"
              className={'mode-option' + (formMode === 'recognition' ? ' is-active' : '')}
              aria-pressed={formMode === 'recognition'}
              onClick={() => setFormMode('recognition')}
            >
              Recognition
            </button>
          </div>
          <label className="field">
            <span className="label-text">
              Employee name <span className="req">*</span>
            </span>
            <input
              className={'field-control' + (invalidName ? ' is-invalid' : '')}
              value={input.employeeName}
              onChange={(e) => setInput((s) => ({ ...s, employeeName: e.target.value }))}
              placeholder="e.g. Leeann"
              autoComplete="name"
            />
          </label>
          <label className="field">
            <span className="label-text">
              Coaching form is for <span className="req">*</span>
            </span>
            <textarea
              className={'field-control textarea' + (invalidReason ? ' is-invalid' : '')}
              value={input.coachingReason}
              onChange={(e) => setInput((s) => ({ ...s, coachingReason: e.target.value }))}
              placeholder={workspaceUI.reasonPlaceholder}
              rows={3}
            />
          </label>
          <label className="field field--notes-tight">
            <span className="label-text">Optional notes</span>
            <textarea
              className="field-control textarea"
              value={input.notes}
              onChange={(e) => setInput((s) => ({ ...s, notes: e.target.value }))}
              placeholder={workspaceUI.notesPlaceholder}
              rows={3}
            />
          </label>
          <div
            className={
              'tutorial-generate-anchor' + (tutorialPhase === 'spotlight_generate' ? ' is-tutorial-step' : '')
            }
          >
            {tutorialPhase === 'spotlight_generate' && (
              <p className="tutorial-hint-bubble" id="tutorial-generate-hint">
                Tap Generate
              </p>
            )}
            <button
              ref={generateBtnRef}
              type="button"
              className={
                'btn-primary btn-generate-premium' +
                (profile && isFreeLimitReached(profile) && tutorialPhase === 'off' ? ' is-limit-reached' : '') +
                (tutorialHighlightGenerate ? ' is-tutorial-focus' : '')
              }
              disabled={loading || generationBlocked}
              onClick={() => void generate()}
              aria-describedby={tutorialPhase === 'spotlight_generate' ? 'tutorial-generate-hint' : undefined}
            >
              {loading && <span className="spinner" aria-hidden />}
              {loading ? 'Generating...' : workspaceUI.generateButtonIdle}
            </button>
          </div>
          {showValidation && !canGenerate && (
            <p className="hint-error">Enter employee name and what the coaching form is for.</p>
          )}
          {generationError && !logText && <p className="hint-error">{generationError}</p>}
          {profile && isFreeLimitReached(profile) && tutorialPhase === 'off' && (
            <div className="plan-limit-banner plan-limit-banner--premium" role="note">
              <div className="plan-limit-banner-top">
                <span className="plan-limit-pro-badge" aria-hidden>
                  <span className="plan-limit-pro-badge-icon">✦</span>
                  Pro
                </span>
                <p className="plan-limit-title">{FREE_LIMIT_HEADLINE}</p>
              </div>
              <p className="plan-limit-text plan-limit-text--compact">{workspaceUI.freeLimitBody}</p>
              <ul className="plan-limit-bullets">
                {PAYWALL_PRO_BULLETS.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="plan-limit-extra">Need unlimited refinements? Elite includes unlimited AI refinements ($11.99/mo).</p>
              <p className="plan-limit-trust-mini">Cancel anytime from Settings.</p>
              <div className="plan-limit-checkout-row">
                <UpgradeToProButton
                  userId={profile.id}
                  email={profile.email}
                  checkoutPlan="pro"
                  ctaLabel="Unlock Pro — $8.99"
                  onBillingUpdated={() => void refresh()}
                />
                <UpgradeToProButton
                  userId={profile.id}
                  email={profile.email}
                  checkoutPlan="elite"
                  variant="outline"
                  ctaLabel="Unlock Elite — $11.99"
                  onBillingUpdated={() => void refresh()}
                />
              </div>
            </div>
          )}
        </section>

        <section
          className={
            'card output-card' + (tutorialPhase === 'spotlight_output' ? ' is-tutorial-spotlight' : '')
          }
          ref={outputCardRef}
        >
          <div className="output-top">
            {!loading && logText ? (
              <div className="output-panel-head">
                <div className="output-panel-head-row">
                  <div className="output-panel-head-left">
                    <h2 className="output-panel-title">
                      {logSource === 'openai' ? 'Assistant Draft' : 'Coaching Draft'}
                    </h2>
                    {lastGenerationMs != null && (
                      <span className="output-gen-badge">{formatGenerationBadgeLabel(lastGenerationMs, logSource)}</span>
                    )}
                  </div>
                  {tutorialPhase === 'off' && (
                    <button
                      type="button"
                      className={'btn-copy-entire btn-copy-entire--primary' + (copyEntireSuccess ? ' is-success' : '')}
                      onClick={() => void copyEntireForm()}
                    >
                      {copyEntireSuccess ? (
                        <span className="btn-copy-entire-check" aria-hidden>
                          ✓
                        </span>
                      ) : null}
                      Copy entire form
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="output-top-row output-top-row--placeholder">
                <h2 className="card-title">Output</h2>
              </div>
            )}
          </div>
          {loading && (
            <div className="output-loading-premium" aria-busy="true" aria-live="polite">
              <p className="output-loading-caption">{workspaceUI.outputLoadingCaption}</p>
              <div className="output-document output-document--loading">
                <div className="output-skeleton-doc">
                  <div className="output-skeleton-line output-skeleton-line--title" />
                  <div className="output-skeleton-section">
                    <div className="output-skeleton-chip" />
                    <div className="output-skeleton-line" />
                    <div className="output-skeleton-line output-skeleton-line--medium" />
                    <div className="output-skeleton-line output-skeleton-line--short" />
                  </div>
                  <div className="output-skeleton-section output-skeleton-section--delayed">
                    <div className="output-skeleton-chip output-skeleton-chip--narrow" />
                    <div className="output-skeleton-line" />
                    <div className="output-skeleton-line" />
                    <div className="output-skeleton-line output-skeleton-line--short" />
                  </div>
                  <div className="output-skeleton-section output-skeleton-section--delayed2">
                    <div className="output-skeleton-chip output-skeleton-chip--narrow" />
                    <div className="output-skeleton-line output-skeleton-line--medium" />
                    <div className="output-skeleton-line" />
                  </div>
                </div>
              </div>
            </div>
          )}
          {!loading && !logText && (
            <div className="output-empty-premium">
              <div className="output-empty-doc">
                <div className="output-empty-icon" aria-hidden>
                  <svg viewBox="0 0 48 56" width="48" height="56" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M12 4h18l10 10v34a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      opacity="0.35"
                    />
                    <path d="M30 4v10h10" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
                    <path d="M16 24h16M16 30h12M16 36h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
                  </svg>
                </div>
                <h3 className="output-empty-title">Your AI-generated coaching form will appear here</h3>
                <p className="output-empty-sub">{workspaceUI.outputEmptySub}</p>
              </div>
            </div>
          )}
          {!loading && logText && (
            <div className="output-result-fade">
              {generationError && (
                <p className="hint-error output-inline-error" role="alert">
                  {generationError}
                </p>
              )}
              {logSource === 'deterministic' && (
                <p className="output-fallback-notice" role="status">
                  ⚠️ AI unavailable — showing backup coaching
                </p>
              )}
              <div className="output-document">
                <div className="output-doc-summary" role="status">
                  <span className="output-doc-summary-lead">
                    <svg className="output-doc-summary-check" width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                      <path
                        fill="currentColor"
                        d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06l2.72 2.72 6.72-6.72a.75.75 0 0 1 1.06 0z"
                      />
                    </svg>
                    Coaching form ready
                  </span>
                  {lastGenerationMs != null && (
                    <>
                      <span className="output-doc-summary-sep" aria-hidden />
                      <span className="output-doc-summary-meta">{formatGenerationBadgeLabel(lastGenerationMs, logSource)}</span>
                    </>
                  )}
                  <span className="output-doc-summary-sep" aria-hidden />
                  <span className="output-doc-summary-tail">Ready to copy or refine</span>
                </div>

                <div className="output-doc-sections">
                  {parsedSections.map((sec, i) => {
                    const rowKey = `${sec.id}-${i}`
                    const canCopy = sectionClipboardHasContent(sec.id, sec.body)
                    const title = documentSectionTitle(sec.id)
                    const canRefine =
                      tutorialPhase === 'off' &&
                      REFINABLE_SECTION_IDS.has(sec.id) &&
                      refinementQuota.canRefine
                    const sectionLabel = sec.id as CoachingFormSectionLabel
                    const applyDisabled =
                      refiningRowKey !== null ||
                      generationBlocked ||
                      profileLoading ||
                      !profile ||
                      (!refinePresetPick && !refineCustomText.trim())
                    return (
                      <article
                        key={rowKey}
                        className={
                          'output-doc-section' +
                          (refiningRowKey === rowKey ? ' is-section-refining' : '') +
                          (refinedFlashKeys[rowKey] ? ' is-section-refined-flash' : '')
                        }
                      >
                        <div className="output-doc-section-head">
                          <span className="output-doc-section-accent" aria-hidden />
                          <h3 className="output-doc-section-title">{title}</h3>
                          {refinedFlashKeys[rowKey] && (
                            <span className="output-refine-done-badge" role="status">
                              Refined
                            </span>
                          )}
                          {canRefine && (
                            <button
                              type="button"
                              className={
                                'btn-section-refine' + (refineOpenRowKey === rowKey ? ' is-open' : '')
                              }
                              aria-expanded={refineOpenRowKey === rowKey}
                              onClick={() => {
                                setRefineOpenRowKey((k) => {
                                  if (k === rowKey) {
                                    return null
                                  }
                                  setRefinePresetPick(null)
                                  setRefineCustomText('')
                                  return rowKey
                                })
                              }}
                            >
                              Refine
                            </button>
                          )}
                          <button
                            type="button"
                            className={
                              'btn-section-copy-icon' + (copiedSectionKeys[rowKey] ? ' is-copied' : '')
                            }
                            disabled={!canCopy}
                            title={canCopy ? `Copy ${sec.id}` : 'Nothing to copy in this section'}
                            aria-label={canCopy ? `Copy ${sec.id}` : 'Nothing to copy in this section'}
                            onClick={() => void copySection(rowKey, sec.id, sec.body)}
                          >
                            <SectionCopyIcon copied={Boolean(copiedSectionKeys[rowKey])} />
                          </button>
                        </div>
                        {canRefine && refineOpenRowKey === rowKey && (
                          <div className="output-refine-panel">
                            <p className="output-refine-label">Quick refinements</p>
                            <div className="output-refine-chips" role="group" aria-label="Quick refinements">
                              {REFINE_QUICK_OPTIONS.map((o) => (
                                <button
                                  key={o.preset}
                                  type="button"
                                  className={
                                    'output-refine-chip' + (refinePresetPick === o.preset ? ' is-selected' : '')
                                  }
                                  onClick={() => setRefinePresetPick(o.preset)}
                                >
                                  {o.label}
                                </button>
                              ))}
                            </div>
                            <label className="output-refine-custom-label">
                              <span className="output-refine-custom-title">
                                Tell TrackoraAI how to refine this section…
                              </span>
                              <textarea
                                className="field-control output-refine-textarea"
                                rows={2}
                                value={refineCustomText}
                                onChange={(e) => setRefineCustomText(e.target.value)}
                                placeholder="Optional details for this section only"
                              />
                            </label>
                            <button
                              type="button"
                              className="btn-primary output-refine-apply"
                              disabled={applyDisabled}
                              onClick={() => void applySectionRefinement(sectionLabel, rowKey, sec.body)}
                            >
                              {refiningRowKey === rowKey ? (
                                <>
                                  <span className="spinner" aria-hidden />
                                  Refining…
                                </>
                              ) : (
                                'Apply refinement'
                              )}
                            </button>
                          </div>
                        )}
                        <div className="output-doc-section-body">
                          {sec.id === 'Next Steps' ? (
                            <OutputNextStepsBody body={sec.body} />
                          ) : (
                            <div className="output-doc-text">{sec.body}</div>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>

              {tutorialPhase === 'off' && (
                <div className="output-actions-row">
                  <button
                    type="button"
                    className="btn-output-regenerate"
                    disabled={loading || generationBlocked}
                    onClick={() => regenerate()}
                  >
                    Regenerate
                  </button>
                </div>
              )}
              {tutorialPhase === 'off' && (
                <div
                  className={
                    'output-helpfulness' +
                    (outputHelpfulness === 'yes' ? ' output-helpfulness--yes' : '')
                  }
                  role="group"
                  aria-label="Was this coaching output helpful"
                >
                  <p className="output-helpfulness-q">Was this useful?</p>
                  <div className="output-helpfulness-btns">
                    <button
                      type="button"
                      className={'btn-secondary output-helpfulness-btn' + (outputHelpfulness === 'yes' ? ' is-selected' : '')}
                      onClick={() => setOutputHelpfulness('yes')}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className={'btn-secondary output-helpfulness-btn' + (outputHelpfulness === 'no' ? ' is-selected' : '')}
                      onClick={() => {
                        setOutputHelpfulness('no')
                        window.dispatchEvent(
                          new CustomEvent('trackora-open-feedback', {
                            detail: {
                              presetMessage:
                                'The last coaching form missed the mark (accuracy or tone): ',
                            },
                          }),
                        )
                      }}
                    >
                      Send feedback
                    </button>
                  </div>
                  {outputHelpfulness === 'yes' && (
                    <p className="output-helpfulness-thanks" role="status" aria-live="polite">
                      Thanks — glad this helped.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <p className="fine-print">
        Your notes are sent securely to generate your form — ready to copy, save, or share with your team.
      </p>

      {tutorialPhase === 'walkthrough' && (
        <div
          className="tutorial-welcome-root"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tutorial-welcome-title"
        >
          <div className="tutorial-welcome-backdrop" aria-hidden />
          <div className="tutorial-welcome-card card">
            <p className="tutorial-step-kicker">
              Step {tutorialStepIndex + 1} of {TUTORIAL_STEPS.length}
            </p>
            <h2 id="tutorial-welcome-title" className="tutorial-welcome-headline">
              {tutorialStep.title}
            </h2>
            <p className="tutorial-welcome-lede">{tutorialStep.body}</p>
            {tutorialStep.support && <p className="tutorial-note">{tutorialStep.support}</p>}
            {tutorialStepIndex === TUTORIAL_STEPS.length - 1 && (
              <p className="tutorial-note">Build stronger coaching in less time — starting with your next shift.</p>
            )}
            <div className="tutorial-actions-row">
              {tutorialStepIndex > 0 && (
                <button type="button" className="btn-secondary tutorial-back-btn" onClick={onTutorialBack}>
                  Back
                </button>
              )}
              {tutorialStepIndex < TUTORIAL_STEPS.length - 1 ? (
                <button type="button" className="btn-primary tutorial-welcome-cta" onClick={onTutorialNext}>
                  Continue
                </button>
              ) : (
                <button type="button" className="btn-primary tutorial-welcome-cta" onClick={onTutorialStartGenerating}>
                  Start generating
                </button>
              )}
            </div>
            <div className="tutorial-skip-row">
              <button
                type="button"
                className="btn-text tutorial-skip-btn"
                disabled={tutorialDismissBusy}
                onClick={() => void dismissTutorialChrome()}
              >
                {tutorialDismissBusy ? 'Saving…' : 'Skip tutorial'}
              </button>
            </div>
            {tutorialDismissError && (
              <p className="tutorial-dismiss-error" role="alert">
                {tutorialDismissError}
              </p>
            )}
          </div>
        </div>
      )}

      {tutorialPhase === 'spotlight_output' && logText && (
        <div className="tutorial-output-hud">
          <p className="tutorial-output-label">Your form</p>
          {tutorialDismissError && (
            <p className="tutorial-dismiss-error tutorial-dismiss-error--hud" role="alert">
              {tutorialDismissError}
            </p>
          )}
          <button
            type="button"
            className="tutorial-done-btn"
            disabled={tutorialDismissBusy}
            onClick={() => void dismissTutorialChrome()}
          >
            {tutorialDismissBusy ? 'Saving…' : 'Done'}
          </button>
        </div>
      )}

      {showRefinementLimitModal && profile && (
        <div className="paywall-modal-root" role="presentation">
          <button
            type="button"
            className="paywall-modal-backdrop"
            aria-label="Close refinement limit notice"
            onClick={() => setShowRefinementLimitModal(false)}
          />
          <div
            className="paywall-modal card paywall-modal--premium paywall-modal--refinement"
            role="dialog"
            aria-modal="true"
            aria-labelledby="refinement-limit-title"
          >
            <div className="paywall-modal-head">
              <span className="paywall-pro-badge" aria-hidden>
                <span className="paywall-pro-badge-icon">✦</span>
                Pro
              </span>
              <h2 id="refinement-limit-title" className="paywall-title">
                {REFINEMENT_LIMIT_HEADLINE}
              </h2>
            </div>
            <p className="paywall-body">{REFINEMENT_LIMIT_SUBTEXT}</p>
            <p className="paywall-trust">Your coaching forms are unlimited — only section refinements reset each month.</p>
            <div className="paywall-actions">
              <button
                type="button"
                className="btn-primary btn-plan-upgrade"
                onClick={() => setShowRefinementLimitModal(false)}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {showLimitPaywall && profile && !hasPremiumAccess(profile) && (
        <div className="paywall-modal-root" role="presentation">
          <button
            type="button"
            className="paywall-modal-backdrop"
            aria-label="Close paywall"
            onClick={() => setShowLimitPaywall(false)}
          />
          <div className="paywall-modal card paywall-modal--premium" role="dialog" aria-modal="true" aria-labelledby="paywall-title">
            <div className="paywall-modal-head">
              <h2 id="paywall-title" className="paywall-title">
                {FREE_LIMIT_HEADLINE}
              </h2>
            </div>
            <p className="paywall-body">{workspaceUI.freeLimitBody}</p>
            <div className="paywall-plan-pick" role="group" aria-label="Choose a plan">
              <div className="paywall-plan-card paywall-plan-card--pro">
                <span className="paywall-plan-kicker">Pro</span>
                <p className="paywall-plan-price">$8.99<span className="paywall-plan-per">/mo</span></p>
                <ul className="paywall-plan-list">
                  {PAYWALL_PRO_BULLETS.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <UpgradeToProButton
                  userId={profile.id}
                  email={profile.email}
                  checkoutPlan="pro"
                  ctaLabel="Get Pro"
                  onBillingUpdated={() => void refresh()}
                />
              </div>
              <div className="paywall-plan-card paywall-plan-card--elite">
                <span className="paywall-plan-kicker paywall-plan-kicker--elite">Elite</span>
                <p className="paywall-plan-price">$11.99<span className="paywall-plan-per">/mo</span></p>
                <ul className="paywall-plan-list">
                  {PAYWALL_ELITE_BULLETS.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <UpgradeToProButton
                  userId={profile.id}
                  email={profile.email}
                  checkoutPlan="elite"
                  ctaLabel="Get Elite"
                  onBillingUpdated={() => void refresh()}
                />
              </div>
            </div>
            <p className="paywall-trust">Cancel anytime from Settings.</p>
            <div className="paywall-actions">
              <button
                type="button"
                className="btn-text paywall-secondary"
                onClick={() => setShowLimitPaywall(false)}
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}

      {showPricingModal && profile && (
        <div className="pricing-modal-root" role="presentation">
          <button
            type="button"
            className="pricing-modal-backdrop"
            aria-label="Close plans"
            onClick={() => setShowPricingModal(false)}
          />
          <div
            className="pricing-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pricing-modal-title"
          >
            <div className="pricing-modal-header">
              <div>
                <h2 id="pricing-modal-title" className="pricing-modal-title">
                  Plans
                </h2>
                <p className="pricing-modal-lede">Pick the tier that fits how often you refine. Cancel anytime from Settings.</p>
              </div>
              <button
                type="button"
                className="pricing-modal-close"
                aria-label="Close"
                onClick={() => setShowPricingModal(false)}
              >
                ×
              </button>
            </div>
            <div className="pricing-modal-grid">
              <article className="pricing-tier-card">
                <span className="pricing-tier-kicker">Free</span>
                <p className="pricing-tier-price">$0</p>
                <ul className="pricing-tier-list">
                  {PRICING_MODAL_FREE_BULLETS.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <div className="pricing-tier-footer">
                  {isFreePlan(profile, profile.email) ? (
                    <button type="button" className="btn-secondary pricing-tier-cta pricing-tier-cta--current" disabled>
                      Current plan
                    </button>
                  ) : (
                    <button type="button" className="btn-secondary pricing-tier-cta pricing-tier-cta--current" disabled>
                      Start free
                    </button>
                  )}
                </div>
              </article>

              <article className="pricing-tier-card pricing-tier-card--popular">
                <span className="pricing-tier-ribbon pricing-tier-ribbon--popular" aria-hidden>
                  Most popular
                </span>
                <span className="pricing-tier-kicker">Pro</span>
                <p className="pricing-tier-price">
                  $8.99<span className="pricing-tier-price-suffix">/mo</span>
                </p>
                <ul className="pricing-tier-list">
                  {PRICING_MODAL_PRO_BULLETS.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <div className="pricing-tier-footer">
                  {isProPlan(profile, profile.email) ? (
                    <button type="button" className="btn-primary pricing-tier-cta pricing-tier-cta--current" disabled>
                      Current plan
                    </button>
                  ) : (
                    <UpgradeToProButton
                      userId={profile.id}
                      email={profile.email}
                      checkoutPlan="pro"
                      ctaLabel="Choose Pro"
                      onBillingUpdated={() => {
                        setShowPricingModal(false)
                        void refresh()
                      }}
                    />
                  )}
                </div>
              </article>

              <article className="pricing-tier-card pricing-tier-card--elite">
                <span className="pricing-tier-ribbon pricing-tier-ribbon--elite" aria-hidden>
                  Best value
                </span>
                <span className="pricing-tier-kicker pricing-tier-kicker--elite">Elite</span>
                <p className="pricing-tier-price">
                  $11.99<span className="pricing-tier-price-suffix">/mo</span>
                </p>
                <ul className="pricing-tier-list">
                  {PRICING_MODAL_ELITE_BULLETS.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <div className="pricing-tier-footer">
                  {isElitePlan(profile, profile.email) ? (
                    <button type="button" className="btn-primary pricing-tier-cta pricing-tier-cta--elite pricing-tier-cta--current" disabled>
                      Current plan
                    </button>
                  ) : (
                    <UpgradeToProButton
                      userId={profile.id}
                      email={profile.email}
                      checkoutPlan="elite"
                      ctaLabel="Choose Elite"
                      onBillingUpdated={() => {
                        setShowPricingModal(false)
                        void refresh()
                      }}
                    />
                  )}
                </div>
              </article>
            </div>
          </div>
        </div>
      )}

      {showWarmupNotice && (
        <div className="warmup-toast" role="status" aria-live="polite">
          <p className="warmup-toast-text">
            First AI request may take up to a minute while the server wakes up.
          </p>
        </div>
      )}

      {copyFormToast && (
        <div className="copy-form-toast" role="status" aria-live="polite">
          Coaching form copied successfully.
        </div>
      )}
    </div>
  )
}
