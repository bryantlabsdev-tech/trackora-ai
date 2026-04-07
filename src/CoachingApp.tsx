import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { requestCoachingLog } from './api/requestCoachingLog'
import { useProfile } from './context/ProfileContext'
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
      const res = await fetch('https://trackora-ai.onrender.com/create-checkout-session', {
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

function emptyInput(): SimpleCoachingInput {
  return { employeeName: '', coachingReason: '', notes: '' }
}

export default function CoachingApp() {
  const { profile, loading: profileLoading, error: profileError, recordOpenAiGeneration } = useProfile()
  const [input, setInput] = useState<SimpleCoachingInput>(emptyInput)
  const [formMode, setFormMode] = useState<FormMode>('coaching')
  const [showValidation, setShowValidation] = useState(false)
  const [logText, setLogText] = useState<string | null>(null)
  const [logSource, setLogSource] = useState<'openai' | 'fallback' | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastGenerationMs, setLastGenerationMs] = useState<number | null>(null)
  /** Per-section copy feedback, keyed by `${sec.id}-${index}` */
  const [copiedSectionKeys, setCopiedSectionKeys] = useState<Record<string, boolean>>({})
  const [showWarmupNotice, setShowWarmupNotice] = useState(false)
  /** If sessionStorage is blocked, still only show the tip once per tab load */
  const warmupFallbackUsedRef = useRef(false)

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
    const blocked = profileLoading || !profile || !canUseAiGeneration(profile)
    const usageCount = profile?.usage_count ?? null
    const isPro = profile?.is_pro ?? null
    const remainingForLog =
      profile && !profile.is_pro ? freeGenerationsRemaining(profile) : Number.POSITIVE_INFINITY
    console.log('[usage] is_pro:', isPro)
    console.log('[usage] current free usage count:', usageCount)
    console.log('[usage] remaining generations:', remainingForLog)
    console.log('[usage] generation blocked:', blocked)

    if (blocked) {
      return
    }
    setShowValidation(false)

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

    setLoading(true)
    const startedAt = Date.now()
    setLogText(null)
    setLogSource(null)
    setLastGenerationMs(null)
    setCopiedSectionKeys({})
    try {
      const result = await requestCoachingLog(payload)
      setLogText(result.text)
      setLogSource(result.source)
      setLastGenerationMs(Date.now() - startedAt)

      const generationSuccessful = typeof result.text === 'string' && result.text.trim().length > 0
      const shouldIncrementUsage = generationSuccessful && Boolean(profile && !profile.is_pro)
      console.log('[usage] result.source:', result.source)
      console.log('[usage] generation successful:', generationSuccessful)
      console.log('[usage] incrementing usage:', shouldIncrementUsage)

      if (shouldIncrementUsage) {
        await recordOpenAiGeneration()
      }
    } finally {
      setLoading(false)
      setShowWarmupNotice(false)
    }
  }, [canGenerate, payload, profile, profileLoading, recordOpenAiGeneration])

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

  const generationBlocked = profileLoading || !profile || !canUseAiGeneration(profile)

  return (
    <div className="app">
      <header className="header">
        <p className="eyebrow">Trackora</p>
        <h1>Coaching form</h1>
        <p className="lede">
          Generate structured, professional coaching forms in seconds using AI. Built for Walmart / OSL
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
          {profile && isFreeLimitReached(profile) && (
            <div className="plan-limit-banner">
              <p className="plan-limit-text">Free limit reached. Upgrade to Pro to continue.</p>
              <UpgradeToProButton userId={profile.id} email={profile.email} />
            </div>
          )}
          <button
            type="button"
            className="btn-primary btn-generate-premium"
            disabled={loading || generationBlocked}
            onClick={() => void generate()}
          >
            {loading && <span className="spinner" aria-hidden />}
            {loading ? 'Generating...' : 'Generate AI Coaching Form'}
          </button>
          {showValidation && !canGenerate && (
            <p className="hint-error">Enter employee name and what the coaching form is for.</p>
          )}
        </section>

        <section className="card output-card">
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
              {lastGenerationMs != null && (
                <p className="output-generated-meta">
                  {lastGenerationMs < 1500
                    ? 'Generated instantly ⚡'
                    : `Generated in ${(lastGenerationMs / 1000).toFixed(1)} seconds`}
                </p>
              )}
              {logSource && (
                <p className="output-source">
                  {logSource === 'openai' ? 'Assistant draft' : 'Offline draft'}
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
            </div>
          )}
        </section>
      </div>

      <p className="fine-print">
        API runs on your server; key stays in <code>.env</code>.
      </p>

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
