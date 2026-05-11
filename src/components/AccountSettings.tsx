import { useEffect, useMemo, useState } from 'react'
import { useProfile } from '../context/ProfileContext'
import { startEliteUpgrade } from '../api/startEliteUpgrade'
import { getCreateBillingPortalSessionUrl, getCreateCheckoutSessionUrl } from '../lib/apiBase'
import { supabase } from '../lib/supabase'
import { persistCoachingWorkspace } from '../lib/profileApi'
import { parseCoachingWorkspace } from '../../shared/coachingWorkspace.mjs'
import { WORKSPACE_LABEL, WORKSPACE_STORAGE_KEY } from '../lib/workspaceLabels'
import {
  freeGenerationsRemainingLabel,
  getPlanDisplayLabel,
  getRefinementQuotaForProfile,
  hasPremiumAccess,
  isElitePlan,
  isOwnerFreePro,
} from '../types/profile'
import PrivacyPolicyContent from './PrivacyPolicyContent'

type AccountSettingsProps = {
  userId: string
  email: string | null
  onGoToCoaching: () => void
  onSignOut: () => Promise<void>
}

export default function AccountSettings({ userId, email, onGoToCoaching, onSignOut }: AccountSettingsProps) {
  const { profile, loading, error, refresh, replayTutorialFromSettings } = useProfile()
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [eliteInfoMsg, setEliteInfoMsg] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordInfo, setPasswordInfo] = useState<string | null>(null)
  const [tutorialReplayLoading, setTutorialReplayLoading] = useState(false)
  const [tutorialReplayError, setTutorialReplayError] = useState<string | null>(null)
  const [workspaceBusy, setWorkspaceBusy] = useState(false)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false)

  useEffect(() => {
    if (!privacyModalOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPrivacyModalOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [privacyModalOpen])

  const planLabel = profile ? getPlanDisplayLabel(profile, email ?? profile.email) : 'Free'
  const planPillClass =
    profile && hasPremiumAccess(profile)
      ? isElitePlan(profile, email ?? profile.email)
        ? 'is-elite'
        : 'is-pro'
      : 'is-free'

  const usageLabel = useMemo(() => {
    if (!profile) return 'Loading usage...'
    if (hasPremiumAccess(profile)) return `${getPlanDisplayLabel(profile, email ?? profile.email)} plan active`
    return `${freeGenerationsRemainingLabel(profile)} (${profile.usage_count} used)`
  }, [profile, email])

  const refinementLabel = useMemo(() => {
    if (!profile) return null
    const q = getRefinementQuotaForProfile(profile, email ?? profile.email)
    if (!hasPremiumAccess(profile)) return 'Section refinements — Pro or Elite'
    return q.label
  }, [profile, email])
  const canManageSubscription = Boolean(
    hasPremiumAccess(profile) ||
      profile?.stripe_customer_id?.trim() ||
      profile?.stripe_subscription_id?.trim() ||
      profile?.subscription_status?.trim(),
  )
  const subscriptionStatusLabel =
    profile && hasPremiumAccess(profile)
      ? (profile.subscription_status?.trim() || 'active')
      : profile?.subscription_status?.trim() || 'inactive'
  const currentPeriodEndLabel = useMemo(() => {
    if (!profile?.current_period_end) return null
    const d = new Date(profile.current_period_end)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleDateString()
  }, [profile?.current_period_end])
  const cancelAtPeriodEndLikely =
    profile?.subscription_status === 'canceled' && Boolean(profile?.current_period_end)

  async function handleUpgrade(planTier: 'pro' | 'elite' = 'pro') {
    const trimmedUserId = userId.trim()
    if (!trimmedUserId) {
      setCheckoutError('Could not start checkout: missing user id. Please sign in again.')
      return
    }

    setCheckoutError(null)
    setEliteInfoMsg(null)

    if (planTier === 'elite') {
      setCheckoutLoading(true)
      try {
        const r = await startEliteUpgrade()
        if (!r.ok) {
          setCheckoutError(r.error || 'Could not start Elite upgrade.')
          return
        }
        if (r.mode === 'checkout' && r.url) {
          window.location.href = r.url
          return
        }
        if (r.mode === 'subscription_updated') {
          await refresh()
          setEliteInfoMsg(
            'You\u2019re on Elite now. You were charged only today\u2019s prorated difference on your existing subscription.',
          )
          return
        }
        if (r.mode === 'already_elite') {
          setEliteInfoMsg(r.message || 'You\u2019re already on Elite.')
          return
        }
        setCheckoutError('Unexpected billing response.')
      } catch {
        setCheckoutError('Network error. Try again.')
      } finally {
        setCheckoutLoading(false)
      }
      return
    }

    setCheckoutLoading(true)
    try {
      const payload = { userId: trimmedUserId, email: (email ?? '').trim(), planTier }
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

  async function handleManageSubscription() {
    if (!supabase) {
      setPortalError('Auth is not configured. Please refresh and try again.')
      return
    }
    const { data, error: sessionError } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    if (sessionError || !accessToken) {
      setPortalError('Your session expired. Please sign in again and retry.')
      return
    }

    setPortalError(null)
    setPortalLoading(true)
    try {
      const res = await fetch(getCreateBillingPortalSessionUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok) {
        setPortalError(data.error || 'Could not open billing portal.')
        return
      }
      if (!data.url) {
        setPortalError('No portal URL returned.')
        return
      }
      window.location.href = data.url
    } catch {
      setPortalError('Network error. Try again.')
    } finally {
      setPortalLoading(false)
    }
  }

  async function handleViewTutorial() {
    setTutorialReplayError(null)
    setTutorialReplayLoading(true)
    try {
      const ok = await replayTutorialFromSettings()
      if (!ok) {
        setTutorialReplayError('Could not reset tutorial. Try again.')
        return
      }
      onGoToCoaching()
    } finally {
      setTutorialReplayLoading(false)
    }
  }

  async function handleWorkspaceChange(raw: string) {
    const next = parseCoachingWorkspace(raw)
    if (!supabase || !profile || next === profile.coaching_workspace) return
    setWorkspaceError(null)
    setWorkspaceBusy(true)
    try {
      try {
        localStorage.setItem(WORKSPACE_STORAGE_KEY, next)
      } catch {
        // ignore quota / private mode
      }
      const result = await persistCoachingWorkspace(supabase, next)
      if (!result.ok) {
        setWorkspaceError(result.error || 'Could not update workspace.')
        return
      }
      await refresh()
    } finally {
      setWorkspaceBusy(false)
    }
  }

  async function handleChangePassword() {
    if (!supabase) {
      setPasswordError('Auth is not configured. Please refresh and try again.')
      return
    }
    const targetEmail = (email ?? '').trim()
    if (!targetEmail) {
      setPasswordError('No email found for your account. Please sign in again.')
      return
    }

    setPasswordError(null)
    setPasswordInfo(null)
    setPasswordLoading(true)
    try {
      const redirectTo = `${window.location.origin}/reset-password`
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(targetEmail, { redirectTo })
      if (resetError) {
        setPasswordError(resetError.message)
        return
      }
      setPasswordInfo('Password reset email sent. Check your inbox.')
    } finally {
      setPasswordLoading(false)
    }
  }

  return (
    <main className="settings-page">
      <header className="settings-page-header">
        <div className="settings-page-header-main">
          <p className="settings-dashboard-eyebrow">TrackoraAI</p>
          <h1 className="settings-dashboard-title">Account Settings</h1>
          <p className="settings-dashboard-desc">
            Manage your profile, plan, workspace, and privacy.
          </p>
        </div>
        <button type="button" className="settings-back-coaching btn-primary" onClick={() => void onGoToCoaching()}>
          Back to Coaching
        </button>
      </header>

      <section className="settings-grid" aria-label="Account sections">
        <article className="card settings-card">
          <h2 className="card-title settings-section-title">Profile</h2>
          <p className="settings-section-lead">Your account identity in TrackoraAI.</p>
          <dl className="settings-dl">
            <div className="settings-dl-row">
              <dt className="settings-dl-term">Display name</dt>
              <dd className={'settings-dl-def' + (email ? '' : ' settings-dl-def--empty')}>
                {email ? email.split('@')[0] : 'Add after sign-in'}
              </dd>
            </div>
            <div className="settings-dl-row">
              <dt className="settings-dl-term">Email</dt>
              <dd className="settings-dl-def settings-dl-def-email" title={email ?? undefined}>
                {email ?? 'Unavailable'}
              </dd>
            </div>
          </dl>
        </article>

        <article className="card settings-card">
          <h2 className="card-title settings-section-title">Workspace</h2>
          <p className="settings-section-lead">
            Choose the coaching experience that fits your team. Switch between specialized environments to tailor
            TrackoraAI to your workplace.
          </p>
          {!profile && (
            <p className="settings-empty-state" role="status">
              Loading your workspace…
            </p>
          )}
          {profile && (
            <>
              <dl className="settings-dl settings-dl--compact">
                <div className="settings-dl-row">
                  <dt className="settings-dl-term">Current workspace</dt>
                  <dd className="settings-dl-def">{WORKSPACE_LABEL[profile.coaching_workspace]}</dd>
                </div>
              </dl>
              <label className="workspace-settings-field">
                <span className="settings-field-label">Coaching environment</span>
                <select
                  className="workspace-settings-select"
                  value={profile.coaching_workspace}
                  onChange={(e) => void handleWorkspaceChange(e.target.value)}
                  disabled={workspaceBusy || !supabase}
                  aria-label="Select coaching environment"
                >
                  <option value="mobile_sales">{WORKSPACE_LABEL.mobile_sales}</option>
                  <option value="general_workplace">{WORKSPACE_LABEL.general_workplace}</option>
                </select>
              </label>
              <p className="settings-workspace-hint">
                Changing your workspace updates suggested topics, prompts, and the wording in your generated forms.
              </p>
              {workspaceBusy && <p className="settings-inline-status">Saving…</p>}
              {workspaceError && <p className="settings-error">{workspaceError}</p>}
            </>
          )}
        </article>

        <article className="card settings-card settings-card--subscription">
          <h2 className="card-title settings-section-title">Subscription</h2>
          <p className="settings-section-lead">Plan, usage, and billing.</p>

          <div className="settings-plan-hero">
            <div className="settings-plan-hero-main">
              <span className="settings-field-label">Current plan</span>
              <div className="settings-plan-hero-row">
                <span className={'settings-pill settings-pill--lg ' + planPillClass}>{planLabel}</span>
                <span className="settings-plan-status">{subscriptionStatusLabel}</span>
              </div>
            </div>
          </div>

          {profile && isOwnerFreePro(email ?? profile.email) && (
            <p className="settings-founder-badge">Founder access — full Elite capabilities.</p>
          )}

          {loading && (
            <p className="settings-empty-state" role="status">
              Loading account data…
            </p>
          )}
          {error && <p className="settings-error">{error}</p>}

          {!loading && (
            <ul className="settings-stat-list" aria-label="Usage and billing dates">
              <li>
                <span className="settings-stat-label">Usage</span>
                <span className="settings-stat-value">{usageLabel}</span>
              </li>
              {refinementLabel && (
                <li>
                  <span className="settings-stat-label">Refinements</span>
                  <span className="settings-stat-value settings-stat-value--muted">{refinementLabel}</span>
                </li>
              )}
              {currentPeriodEndLabel && (
                <li>
                  <span className="settings-stat-label">
                    {cancelAtPeriodEndLikely ? 'Access until' : 'Renews on'}
                  </span>
                  <span className="settings-stat-value">{currentPeriodEndLabel}</span>
                </li>
              )}
            </ul>
          )}

          {canManageSubscription ? (
            <div className="settings-subscription-actions">
              <p className="settings-action-hint">Payment method, invoices, and cancellation in Stripe.</p>
              <button
                type="button"
                className="btn-secondary settings-btn settings-btn--lg"
                onClick={() => void handleManageSubscription()}
                disabled={portalLoading}
              >
                {portalLoading ? 'Opening portal…' : 'Manage subscription'}
              </button>
              {portalError && <p className="settings-error">{portalError}</p>}
            </div>
          ) : (
            <div className="settings-subscription-actions">
              <ul className="settings-perk-list">
                <li>
                  <strong>Pro</strong> — Unlimited forms, 25 refinements per month ($8.99/mo).
                </li>
                <li>
                  <strong>Elite</strong> — Unlimited refinements ($11.99/mo).
                </li>
              </ul>
              <p className="settings-elite-proration-hint">
                {
                  'Elite upgrade: pay only today\u2019s prorated difference. On Pro, your existing subscription is updated (no second subscription).'
                }
              </p>
              <div className="settings-upgrade-grid">
                <button
                  type="button"
                  className="btn-primary settings-btn settings-btn--lg"
                  onClick={() => void handleUpgrade('pro')}
                  disabled={checkoutLoading}
                >
                  {checkoutLoading ? 'Opening checkout…' : 'Upgrade to Pro — $8.99'}
                </button>
                <button
                  type="button"
                  className="btn-secondary settings-btn settings-btn--lg"
                  onClick={() => void handleUpgrade('elite')}
                  disabled={checkoutLoading}
                >
                  {checkoutLoading ? 'Opening checkout…' : 'Upgrade to Elite — $11.99'}
                </button>
              </div>
              {eliteInfoMsg && <p className="settings-inline-status">{eliteInfoMsg}</p>}
              {checkoutError && <p className="settings-error">{checkoutError}</p>}
            </div>
          )}
        </article>

        <article className="card settings-card">
          <h2 className="card-title settings-section-title">Security</h2>
          <p className="settings-section-lead">Password and this device.</p>
          <div className="settings-stack-block">
            <span className="settings-field-label">Password</span>
            <p className="settings-block-hint">We&apos;ll email you a secure link to set a new password.</p>
            <button
              type="button"
              className="btn-secondary settings-btn settings-btn--lg"
              onClick={() => void handleChangePassword()}
              disabled={passwordLoading}
            >
              {passwordLoading ? 'Sending reset email…' : 'Change password'}
            </button>
            {passwordError && <p className="settings-error">{passwordError}</p>}
            {passwordInfo && <p className="settings-inline-status">{passwordInfo}</p>}
          </div>
          <div className="settings-card-divider" role="presentation" />
          <div className="settings-stack-block">
            <span className="settings-field-label">Session</span>
            <p className="settings-block-hint">Sign out on this device only.</p>
            <button
              type="button"
              className="btn-secondary settings-btn settings-btn--lg settings-signout"
              onClick={() => void onSignOut()}
            >
              Sign Out
            </button>
          </div>
        </article>

        <article className="card settings-card settings-support-card">
          <h2 className="card-title settings-section-title">Support</h2>
          <p className="settings-section-lead">Replay onboarding when you need a refresher.</p>
          <button
            type="button"
            className="btn-secondary settings-btn settings-btn--lg settings-support-btn"
            onClick={() => void handleViewTutorial()}
            disabled={tutorialReplayLoading}
          >
            {tutorialReplayLoading ? 'Resetting…' : 'Restart tutorial'}
          </button>
          <p className="settings-help-caption">Clears the one-time flag so the walkthrough shows again in Coaching.</p>
          {tutorialReplayError && <p className="settings-error">{tutorialReplayError}</p>}
        </article>

        <article className="card settings-card settings-legal-card">
          <h2 className="card-title settings-section-title">Legal</h2>
          <p className="settings-section-lead">
            Policies, feedback, and how to reach BryantLabs.Dev.
          </p>
          <div className="settings-legal-actions">
            <div className="settings-legal-block">
              <span className="settings-legal-block-label">Privacy Policy</span>
              <button
                type="button"
                className="settings-legal-privacy-btn settings-legal-privacy-btn--wide"
                onClick={() => setPrivacyModalOpen(true)}
              >
                View Privacy Policy
              </button>
              <p className="settings-legal-privacy-hint">
                Same document as the{' '}
                <a href="/privacy" className="settings-legal-inline-link">
                  public /privacy page
                </a>
                .
              </p>
            </div>

            <div className="settings-legal-block">
              <span className="settings-legal-block-label">Terms of Service</span>
              <a
                href="/terms"
                className="settings-legal-privacy-btn settings-legal-privacy-btn--wide settings-legal-doc-anchor"
              >
                View Terms of Service
              </a>
              <p className="settings-legal-privacy-hint">
                Same document as the{' '}
                <a href="/terms" className="settings-legal-inline-link">
                  public /terms page
                </a>
                .
              </p>
            </div>

            <div className="settings-legal-block">
              <span className="settings-legal-block-label">Feedback</span>
              <p className="settings-legal-intro">
                Questions, ideas, or issues? Send feedback directly to BryantLabs.Dev.
              </p>
              <button
                type="button"
                className="btn-secondary settings-btn settings-btn--lg"
                onClick={() => window.dispatchEvent(new CustomEvent('trackora-open-feedback'))}
              >
                Send Feedback
              </button>
            </div>

            <div className="settings-legal-contact-block">
              <span className="settings-legal-block-label">Contact</span>
              <a className="settings-legal-contact-mail" href="mailto:Bryantlabs.dev@gmail.com">
                Bryantlabs.dev@gmail.com
              </a>
            </div>
          </div>
        </article>
      </section>

      {privacyModalOpen && (
        <div
          className="settings-privacy-overlay"
          role="presentation"
          onClick={() => setPrivacyModalOpen(false)}
        >
          <div
            className="settings-privacy-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-policy-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="settings-privacy-toolbar">
              <span className="settings-privacy-toolbar-label">TrackoraAI</span>
              <button
                type="button"
                className="settings-privacy-close"
                onClick={() => setPrivacyModalOpen(false)}
                aria-label="Close privacy policy"
              >
                Close
              </button>
            </div>
            <div className="settings-privacy-scroll">
              <article className="card privacy-card settings-privacy-card">
                <PrivacyPolicyContent />
              </article>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
