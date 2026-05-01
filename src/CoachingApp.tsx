import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FreeLimitReachedError, requestCoachingLog } from './api/requestCoachingLog'
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
    console.log('[upgrade] checkout userId present:', Boolean(trimmedUserId))

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

      console.log('Calling backend checkout...')
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
      console.log('Redirecting to Stripe...')
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

const TUTORIAL_SAMPLE: SimpleCoachingInput = {
  employeeName: 'Alex Rivera',
  coachingReason: 'Late to opening shift twice this week',
  notes: 'Arrived 10+ minutes after start time.',
}

type TutorialPhase = 'off' | 'welcome' | 'spotlight_generate' | 'spotlight_output'

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
  const tutorialPhaseRef = useRef<TutorialPhase>('off')
  const generateBtnRef = useRef<HTMLButtonElement>(null)
  const outputCardRef = useRef<HTMLElement>(null)

  useEffect(() => {
    tutorialPhaseRef.current = tutorialPhase
  }, [tutorialPhase])

  useEffect(() => {
    if (profileLoading || !profile) return
    if (!profile.has_seen_tutorial) {
      setTutorialPhase((p) => {
        if (p === 'welcome' || p === 'spotlight_generate' || p === 'spotlight_output') return p
        return 'welcome'
      })
    } else {
      setTutorialPhase((p) => (p === 'spotlight_output' ? p : 'off'))
    }
  }, [profileLoading, profile?.has_seen_tutorial])

  useEffect(() => {
    if (tutorialPhase !== 'welcome') return
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

  const onTutorialWelcomeContinue = useCallback(() => {
    setInput(TUTORIAL_SAMPLE)
    setShowValidation(false)
    setTutorialPhase('spotlight_generate')
    window.requestAnimationFrame(() => {
      generateBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
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

  const generate = useCallback(async () => {
    if (!canGenerate) {
      setShowValidation(true)
      return
    }
    const blocked =
      profileLoading ||
      !profile ||
      (tutorialPhaseRef.current !== 'spotlight_generate' && !canUseAiGeneration(profile))
    const usageCount = profile?.usage_count ?? null
    const isPro = profile?.is_pro ?? null
    const remainingForLog =
      profile && !profile.is_pro ? freeGenerationsRemaining(profile) : Number.POSITIVE_INFINITY
    console.log('[usage] is_pro:', isPro)
    console.log('[usage] current free usage count:', usageCount)
    console.log('[usage] remaining generations:', remainingForLog)
    console.log('[usage] generation blocked:', blocked)

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

    let shouldShowWarmupTip = false
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

    const isTutorialRun = tutorialPhaseRef.current === 'spotlight_generate'

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
      const shouldIncrementUsage =
        !isTutorialRun &&
        generationSuccessful &&
        result.source === 'openai' &&
        Boolean(profile && !profile.is_pro)
      console.log('[usage] result.source:', result.source)
      console.log('[usage] generation successful:', generationSuccessful)
      console.log('[usage] incrementing usage (OpenAI only):', shouldIncrementUsage)

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
      setGenerationError('Could not generate right now. Please try again.')
    } finally {
      setLoading(false)
      setShowWarmupNotice(false)
    }
  }, [
    canGenerate,
    payload,
    profile,
    profileLoading,
    applyUsageSnapshot,
    completeTutorial,
    refresh,
    triggerPostTutorialFeedbackNudge,
  ])

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

  const invalidName = showValidation && !input.employeeName.trim()
  const invalidReason = showValidation && !input.coachingReason.trim()

  const generationBlocked =
    profileLoading || !profile || (!canUseAiGeneration(profile) && tutorialPhase !== 'spotlight_generate')

  return (
    <div className="app">
      {tutorialPhase === 'spotlight_generate' && <div className="tutorial-dim" aria-hidden />}
      <header className="header">
        <p className="eyebrow">Trackora</p>
        <h1>Coaching form</h1>
        <p className="lede">
          Generate structured, professional coaching forms in seconds using AI. Built for high-performing
          leaders.
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
              placeholder="e.g. Low APS and low accessory sales"
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
          {profile && isFreeLimitReached(profile) && tutorialPhase === 'off' && (
            <div className="plan-limit-banner">
              <p className="plan-limit-title">You&apos;ve used your 3 free AI coaching forms</p>
              <p className="plan-limit-text">
                Upgrade to Pro to generate unlimited coaching forms in seconds and save hours of manual work.
              </p>
              <UpgradeToProButton userId={profile.id} email={profile.email} />
              <p className="plan-limit-value">Most coaching forms take 10-15 minutes to write manually.</p>
              <p className="plan-limit-urgency">Start generating instantly again after upgrading.</p>
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
                (tutorialPhase === 'spotlight_generate' ? ' is-tutorial-focus' : '')
              }
              disabled={loading || generationBlocked}
              onClick={() => void generate()}
              aria-describedby={tutorialPhase === 'spotlight_generate' ? 'tutorial-generate-hint' : undefined}
            >
              {loading && <span className="spinner" aria-hidden />}
              {loading ? 'Generating...' : 'Generate AI Coaching Form'}
            </button>
          </div>
          {profile && isFreeLimitReached(profile) && tutorialPhase === 'off' && (
            <p className="upgrade-inline-hint">Upgrade to continue generating</p>
          )}
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
              {logSource && (
                <p className="output-source">
                  {logSource === 'openai'
                    ? 'Assistant draft'
                    : logSource === 'deterministic'
                      ? 'Server draft'
                      : 'Offline draft'}
                </p>
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
              {profile && profile.usage_count >= 1 && tutorialPhase === 'off' && (
                <p className="post-generation-time-saved">
                  This would normally take 10-15 minutes to write manually.
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      <p className="fine-print">
        API runs on your server; key stays in <code>.env</code>.
      </p>

      {tutorialPhase === 'welcome' && (
        <div
          className="tutorial-welcome-root"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tutorial-welcome-title"
        >
          <div className="tutorial-welcome-backdrop" aria-hidden />
          <div className="tutorial-welcome-card card">
            <h2 id="tutorial-welcome-title" className="tutorial-welcome-headline">
              Create coaching forms in seconds
            </h2>
            <p className="tutorial-welcome-lede">AI drafts your form — tap once to generate.</p>
            <button type="button" className="btn-primary tutorial-welcome-cta" onClick={onTutorialWelcomeContinue}>
              Continue
            </button>
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
              You&apos;ve used your 3 free AI coaching forms
            </h2>
            <p className="paywall-body">
              Upgrade to Pro to generate unlimited coaching forms in seconds and save hours of manual work.
            </p>
            <p className="paywall-price">Only $8.99/month</p>
            <p className="paywall-value-line">Most coaching forms take 10-15 minutes to write manually.</p>
            <p className="paywall-urgency">Start generating instantly again after upgrading.</p>
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
