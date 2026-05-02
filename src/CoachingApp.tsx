import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CoachingApiError, FreeLimitReachedError, requestCoachingLog } from './api/requestCoachingLog'
import { useProfile } from './context/ProfileContext'
import { usePostTutorialFeedbackNudge } from './context/PostTutorialFeedbackNudgeContext'
import type { CoachingLogApiPayload, FormMode, SimpleCoachingInput } from './types/coaching'
import {
  canUseAiGeneration,
  freeGenerationsRemaining,
  freeGenerationsRemainingLabel,
  isFreeLimitReached,
} from './types/profile'
import {
  copyPlainTextToClipboard,
  formatSectionClipboardBlock,
  sectionClipboardHasContent,
} from './lib/formatCoachingFormClipboard'
import { parseCoachingLogMarkdown } from './lib/parseCoachingLog'
import { getCreateCheckoutSessionUrl } from './lib/apiBase'
import './App.css'

type UpgradeToProButtonProps = {
  userId: string
  email: string
}

function UpgradeToProButton({ userId, email }: UpgradeToProButtonProps) {
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

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
    setCheckoutLoading(true)
    try {
      const payload = {
        userId: trimmedUserId,
        email: email.trim(),
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

  return (
    <div className="upgrade-checkout-wrap">
      <button
        type="button"
        className="btn-primary btn-plan-upgrade"
        disabled={checkoutLoading}
        onClick={() => void startCheckout()}
      >
        {checkoutLoading && <span className="spinner" aria-hidden />}
        {checkoutLoading ? 'Opening checkout…' : 'Upgrade to Pro'}
      </button>
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

/** Single standard headline wherever the free tier is exhausted (paywall, banners). */
const FREE_LIMIT_HEADLINE = "You've used all 3 free coaching generations."

/** Rotate value messaging so we do not repeat one line everywhere. */
const POST_GENERATION_VALUE_LINES = [
  'Build stronger coaching in less time.',
  'Turn messy performance notes into clear coaching.',
  'Coach faster without sounding generic.',
  'Give your team better direction before the shift is over.',
] as const

function pickRotatingLine(lines: readonly string[], seed: number): string {
  if (lines.length === 0) return ''
  const i = Math.abs(Math.trunc(seed)) % lines.length
  return lines[i]!
}

const TUTORIAL_SAMPLE: SimpleCoachingInput = {
  employeeName: 'Alex Rivera',
  coachingReason: 'Late to opening shift twice this week',
  notes: 'Arrived 10+ minutes after start time.',
}

type TutorialPhase = 'off' | 'walkthrough' | 'spotlight_generate' | 'spotlight_output'

type TutorialStep = { title: string; body: string; support?: string }

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Write professional coaching forms in seconds',
    body: 'Enter the employee name and what the coaching is for to get started.',
  },
  {
    title: 'Move faster with quick topics',
    body: 'Select a quick topic from the dropdown to instantly fill your coaching form. You can still customize everything.',
  },
  {
    title: 'Get a complete coaching form instantly',
    body: "Click 'Generate AI Coaching Form' and receive a structured, ready-to-use coaching form.",
  },
  {
    title: 'Try it free',
    body: 'Generate 3 coaching forms at no cost — no commitment required.',
  },
  {
    title: 'Help us improve',
    body: 'If anything feels confusing or missing, use the feedback button to let us know. Your input helps us improve the app.',
    support: 'We read every message.',
  },
  {
    title: 'Keep generating without limits',
    body: 'Upgrade for unlimited coaching forms while your team is still on the sales floor.',
  },
]

const QUICK_TOPICS = [
  'Low accessory sales',
  'Attendance',
  'Not hitting goal',
  'Customer experience',
  'Low conversion',
  'Needs confidence',
  'Recognition: Great sales day',
  'Keys',
  'Uniform',
] as const

type QuickCoachPreset = {
  label: string
  mode: FormMode
  input: SimpleCoachingInput
}

/** One-tap starters above the form — sets mode, fills fields; user can edit before Generate. */
const QUICK_COACH_PRESETS: QuickCoachPreset[] = [
  {
    label: 'Late to shift',
    mode: 'coaching',
    input: {
      employeeName: 'Mobile Expert',
      coachingReason: 'Late to shift',
      notes: 'Discuss punctuality and on-time arrival.',
    },
  },
  {
    label: 'Low APS',
    mode: 'coaching',
    input: {
      employeeName: 'Mobile Expert',
      coachingReason: 'Low APS (Attempts Per Shift)',
      notes: 'Add current APS and goal if known. Focus on getting customers to the tablet for eligibility.',
    },
  },
  {
    label: 'High HPA',
    mode: 'coaching',
    input: {
      employeeName: 'Mobile Expert',
      coachingReason: 'High HPA (Hours Per Activation)',
      notes: 'Add numbers if known. High HPA = too long between postpaid activations.',
    },
  },
  {
    label: 'High MPT',
    mode: 'coaching',
    input: {
      employeeName: 'Mobile Expert',
      coachingReason: 'High MPT (Minutes Per Transaction)',
      notes: 'Add context if known. High MPT = too much gap between customer interactions.',
    },
  },
  {
    label: 'Not engaging customers',
    mode: 'coaching',
    input: {
      employeeName: 'Mobile Expert',
      coachingReason: 'Not engaging customers on the sales floor',
      notes: 'Describe what you observed (approach, acknowledgment, handoffs).',
    },
  },
  {
    label: 'Misuse of keys',
    mode: 'coaching',
    input: {
      employeeName: 'Mobile Expert',
      coachingReason: 'Misuse of keys / key control',
      notes: 'Brief facts: what happened and policy expectation.',
    },
  },
  {
    label: 'Recognition',
    mode: 'recognition',
    input: {
      employeeName: 'Mobile Expert',
      coachingReason: 'Strong performance — recognition',
      notes: 'What went well today (sales floor, customer experience, activations, etc.).',
    },
  },
]

function emptyInput(): SimpleCoachingInput {
  return { employeeName: '', coachingReason: '', notes: '' }
}

export default function CoachingApp() {
  const {
    profile,
    loading: profileLoading,
    error: profileError,
    applyUsageSnapshot,
    completeTutorial,
    refresh,
  } = useProfile()
  const { triggerPostTutorialFeedbackNudge } = usePostTutorialFeedbackNudge()
  const [input, setInput] = useState<SimpleCoachingInput>(emptyInput)
  const [formMode, setFormMode] = useState<FormMode>('coaching')
  const [quickTopicSelection, setQuickTopicSelection] = useState('')
  const [showValidation, setShowValidation] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [logText, setLogText] = useState<string | null>(null)
  const [logSource, setLogSource] = useState<'openai' | 'deterministic' | 'fallback' | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastGenerationMs, setLastGenerationMs] = useState<number | null>(null)
  const [showLimitPaywall, setShowLimitPaywall] = useState(false)
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
  /** Rotates post-output value one-liners without triggering extra renders during generation. */
  const [valueLineSeed, setValueLineSeed] = useState(0)
  const [outputHelpfulness, setOutputHelpfulness] = useState<'yes' | 'no' | null>(null)

  useEffect(() => {
    tutorialPhaseRef.current = tutorialPhase
  }, [tutorialPhase])

  useEffect(() => {
    if (profileLoading || !profile) return
    if (!profile.has_seen_tutorial) {
      setTutorialPhase((p) => {
        if (p === 'walkthrough' || p === 'spotlight_generate' || p === 'spotlight_output') return p
        return 'walkthrough'
      })
    } else {
      setTutorialPhase((p) => (p === 'spotlight_output' ? p : 'off'))
    }
  }, [profileLoading, profile?.has_seen_tutorial])

  useEffect(() => {
    if (tutorialPhase !== 'walkthrough') return
    setTutorialStepIndex(0)
    setLogText(null)
    setLogSource(null)
    setLastGenerationMs(null)
  }, [tutorialPhase])

  useEffect(() => {
    if (profile?.is_pro) setShowLimitPaywall(false)
  }, [profile?.is_pro])

  const dismissTutorialChrome = useCallback(() => {
    setTutorialPhase('off')
  }, [])

  useEffect(() => {
    if (tutorialPhase !== 'spotlight_output' || !logText) return
    const el = outputCardRef.current
    if (!el) return
    window.requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }, [tutorialPhase, logText])

  useEffect(() => {
    if (tutorialPhase !== 'spotlight_output') return
    const id = window.setTimeout(() => dismissTutorialChrome(), 4200)
    return () => clearTimeout(id)
  }, [tutorialPhase, dismissTutorialChrome])

  const onTutorialStartGenerating = useCallback(() => {
    setInput(TUTORIAL_SAMPLE)
    setQuickTopicSelection('Attendance')
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
    }
  }, [input, formMode])

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
      const isPro = profile?.is_pro ?? null
      const remainingForLog =
        profile && !profile.is_pro ? freeGenerationsRemaining(profile) : Number.POSITIVE_INFINITY
      if (import.meta.env.DEV) {
        console.log('[usage]', { isPro, usageCount, remainingForLog, blocked, isTutorialRun })
      }

      if (blocked) {
        if (tutorialPhaseRef.current === 'off' && profile && !profile.is_pro && isFreeLimitReached(profile)) {
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
          setValueLineSeed((s) => s + 1)
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

  const applyQuickTopic = useCallback((topic: string) => {
    const recognitionPrefix = 'Recognition:'
    const isRecognition = topic.startsWith(recognitionPrefix)
    const nextTopic = isRecognition ? topic.slice(recognitionPrefix.length).trim() : topic
    setFormMode(isRecognition ? 'recognition' : 'coaching')
    setInput((s) => ({ ...s, coachingReason: nextTopic }))
    setShowValidation(false)
  }, [])

  const onQuickTopicChange = useCallback(
    (value: string) => {
      setQuickTopicSelection(value)
      if (!value) return
      applyQuickTopic(value)
    },
    [applyQuickTopic],
  )

  const applyQuickCoachPreset = useCallback((preset: QuickCoachPreset) => {
    setFormMode(preset.mode)
    setInput(preset.input)
    setQuickTopicSelection('')
    setShowValidation(false)
  }, [])

  const parsedSections = useMemo(() => (logText ? parseCoachingLogMarkdown(logText) : []), [logText])

  const invalidName = showValidation && !input.employeeName.trim()
  const invalidReason = showValidation && !input.coachingReason.trim()

  const generationBlocked =
    profileLoading || !profile || (!canUseAiGeneration(profile) && tutorialPhase !== 'spotlight_generate')
  const tutorialStep = TUTORIAL_STEPS[tutorialStepIndex]
  const tutorialHighlightQuickTopics = tutorialPhase === 'walkthrough' && tutorialStepIndex === 1
  const tutorialHighlightGenerate =
    tutorialPhase === 'spotlight_generate' || (tutorialPhase === 'walkthrough' && tutorialStepIndex === 2)

  return (
    <div className="app">
      {tutorialPhase === 'spotlight_generate' && <div className="tutorial-dim" aria-hidden />}
      <header className="header">
        <p className="eyebrow">Trackora</p>
        <h1>Coaching form</h1>
        <p className="lede">
          AI coaching built for retail wireless Team Leads — turn notes into clear, floor-ready coaching in
          seconds.
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
          {profile && !profileLoading && profile.is_pro && (
            <div className="plan-pro-card" aria-live="polite">
              <span className="plan-pro-title">Pro Plan Active</span>
              <span className="plan-pro-subtext">Unlimited AI generations</span>
            </div>
          )}
          {profile && !profileLoading && !profile.is_pro && (
            <div className="plan-row" aria-live="polite">
              <span className="plan-badge">Free</span>
              <span className="plan-detail">{freeGenerationsRemainingLabel(profile)}</span>
            </div>
          )}
          <div className="quick-coach" aria-label="Quick start presets">
            <p className="quick-coach-label">Quick start</p>
            <div className="quick-coach-row">
              {QUICK_COACH_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className="quick-coach-btn"
                  onClick={() => applyQuickCoachPreset(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
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
              placeholder="e.g. Low APS, high HPA — add numbers in notes"
              rows={3}
            />
          </label>
          <label className="field">
            <span className="label-text">Optional notes</span>
            <textarea
              className="field-control textarea"
              value={input.notes}
              onChange={(e) => setInput((s) => ({ ...s, notes: e.target.value }))}
              placeholder="Observations, context, numbers…"
              rows={4}
            />
          </label>
          <label className={'field' + (tutorialHighlightQuickTopics ? ' tutorial-field-highlight' : '')}>
            <span className="label-text">Quick coaching topics</span>
            <select
              className={'field-control' + (tutorialHighlightQuickTopics ? ' is-tutorial-focus' : '')}
              value={quickTopicSelection}
              onChange={(e) => onQuickTopicChange(e.target.value)}
            >
              <option value="">Select a quick topic...</option>
              {QUICK_TOPICS.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </label>
          {profile && isFreeLimitReached(profile) && tutorialPhase === 'off' && (
            <div className="plan-limit-banner plan-limit-banner--secondary" role="note">
              <p className="plan-limit-title">{FREE_LIMIT_HEADLINE}</p>
              <p className="plan-limit-text plan-limit-text--compact">
                Upgrade for unlimited coaching — better activations and faster floor feedback.
              </p>
              <UpgradeToProButton userId={profile.id} email={profile.email} />
            </div>
          )}
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
              {loading ? 'Generating...' : 'Generate AI Coaching Form'}
            </button>
          </div>
          {showValidation && !canGenerate && (
            <p className="hint-error">Enter employee name and what the coaching form is for.</p>
          )}
          {generationError && <p className="hint-error">{generationError}</p>}
        </section>

        <section
          className={
            'card output-card' + (tutorialPhase === 'spotlight_output' ? ' is-tutorial-spotlight' : '')
          }
          ref={outputCardRef}
        >
          <div className="output-top">
            <h2 className="card-title">Output</h2>
          </div>
          {loading && (
            <div className="output-empty">
              <span className="spinner" aria-hidden />
              <span>Writing form…</span>
            </div>
          )}
          {!loading && !logText && (
            <p className="output-empty">
              Your AI-generated coaching form will appear here.
              <br />
              <br />
              Fill in the details and click generate.
            </p>
          )}
          {!loading && logText && (
            <div className="output-result-fade">
              {logSource === 'deterministic' && (
                <p className="output-fallback-notice" role="status">
                  ⚠️ AI unavailable — showing backup coaching
                </p>
              )}
              {lastGenerationMs != null && logSource === 'openai' && (
                <p className="output-generated-meta">
                  {lastGenerationMs < 1500
                    ? 'Generated instantly ⚡'
                    : `Generated in ${(lastGenerationMs / 1000).toFixed(1)} seconds`}
                </p>
              )}
              {lastGenerationMs != null && logSource === 'deterministic' && (
                <p className="output-generated-meta">
                  {`Prepared in ${(lastGenerationMs / 1000).toFixed(1)} seconds`}
                </p>
              )}
              {logSource === 'openai' && (
                <p className="output-source">Assistant draft</p>
              )}
              <div className="sections">
                {parsedSections.map((sec, i) => {
                  const rowKey = `${sec.id}-${i}`
                  const canCopy = sectionClipboardHasContent(sec.id, sec.body)
                  return (
                    <article key={rowKey} className="section-block">
                      <div className="section-header">
                        <h3>{sec.id}</h3>
                        <button
                          type="button"
                          className="btn-section-copy"
                          disabled={!canCopy}
                          title={canCopy ? `Copy ${sec.id}` : 'Nothing to copy in this section'}
                          onClick={() => void copySection(rowKey, sec.id, sec.body)}
                        >
                          {copiedSectionKeys[rowKey] ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <div className="section-body">{sec.body}</div>
                    </article>
                  )
                })}
              </div>
              {tutorialPhase === 'off' && (
                <div className="output-actions-bar">
                  <button
                    type="button"
                    className="btn-secondary btn-output-action"
                    disabled={loading || generationBlocked}
                    onClick={() => regenerate()}
                  >
                    Regenerate
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-output-action"
                    onClick={() => window.dispatchEvent(new CustomEvent('trackora-open-feedback'))}
                  >
                    Feedback
                  </button>
                </div>
              )}
              {profile && tutorialPhase === 'off' && (
                <p className="post-generation-time-saved">
                  {pickRotatingLine(POST_GENERATION_VALUE_LINES, valueLineSeed)}
                </p>
              )}
              {tutorialPhase === 'off' && (
                <div className="output-helpfulness" role="group" aria-label="Was this coaching output helpful">
                  <p className="output-helpfulness-q">Was this accurate and helpful for your floor coaching?</p>
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
                      No — send feedback
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <p className="fine-print">
        API runs on your server; key stays in <code>.env</code>.
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
          </div>
        </div>
      )}

      {tutorialPhase === 'spotlight_output' && logText && (
        <div className="tutorial-output-hud">
          <p className="tutorial-output-label">Your form</p>
          <button type="button" className="tutorial-done-btn" onClick={dismissTutorialChrome}>
            Done
          </button>
        </div>
      )}

      {showLimitPaywall && profile && !profile.is_pro && (
        <div className="paywall-modal-root" role="presentation">
          <button
            type="button"
            className="paywall-modal-backdrop"
            aria-label="Close paywall"
            onClick={() => setShowLimitPaywall(false)}
          />
          <div className="paywall-modal card" role="dialog" aria-modal="true" aria-labelledby="paywall-title">
            <h2 id="paywall-title" className="paywall-title">
              {FREE_LIMIT_HEADLINE}
            </h2>
            <p className="paywall-body">
              Coach faster, stay consistent, and tie feedback to activations and store performance. Unlimited
              generations keep your Mobile Experts aligned before the shift ends.
            </p>
            <p className="paywall-price">$8.99/month — unlimited coaching generations</p>
            <p className="paywall-value-line">One strong activation often covers the month.</p>
            <div className="paywall-actions">
              <UpgradeToProButton userId={profile.id} email={profile.email} />
              <button
                type="button"
                className="btn-secondary paywall-secondary"
                onClick={() => setShowLimitPaywall(false)}
              >
                Maybe later
              </button>
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
    </div>
  )
}
