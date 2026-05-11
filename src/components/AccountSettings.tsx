import { useMemo, useState } from 'react'
import { useProfile } from '../context/ProfileContext'
import { startEliteUpgrade } from '../api/startEliteUpgrade'
import { getCreateBillingPortalSessionUrl, getCreateCheckoutSessionUrl } from '../lib/apiBase'
import { supabase } from '../lib/supabase'
import {
  freeGenerationsRemainingLabel,
  getPlanDisplayLabel,
  getRefinementQuotaForProfile,
  hasPremiumAccess,
  isElitePlan,
  isOwnerFreePro,
} from '../types/profile'

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
      <header className="settings-header">
        <p className="eyebrow">Trackora</p>
        <h1>Account Settings</h1>
        <p className="settings-subtitle">Manage your profile, plan, and account access.</p>
      </header>

      <section className="settings-grid">
        <article className="card settings-card">
          <h2 className="card-title">Profile</h2>
          <div className="settings-row">
            <span className="settings-label">Name</span>
            <span className="settings-value">{email ? email.split('@')[0] : 'Not set'}</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Email</span>
            <span className="settings-value settings-email" title={email ?? undefined}>
              {email ?? 'Not available'}
            </span>
          </div>
        </article>

        <article className="card settings-card">
          <h2 className="card-title">Security</h2>
          <p className="settings-note">We’ll email you a secure link to set a new password.</p>
          <button
            type="button"
            className="btn-secondary settings-btn"
            onClick={() => void handleChangePassword()}
            disabled={passwordLoading}
          >
            {passwordLoading ? 'Sending reset email…' : 'Change Password'}
          </button>
          {passwordError && <p className="settings-error">{passwordError}</p>}
          {passwordInfo && <p className="settings-note">{passwordInfo}</p>}
        </article>

        <article className="card settings-card">
          <h2 className="card-title">Subscription</h2>
          <div className="settings-row">
            <span className="settings-label">Current Plan</span>
            <span className={'settings-pill ' + planPillClass}>{planLabel}</span>
          </div>
          {profile && isOwnerFreePro(email ?? profile.email) && (
            <p className="settings-founder-note">Founder access — full Elite capabilities.</p>
          )}
          <div className="settings-row">
            <span className="settings-label">Status</span>
            <span className="settings-value">{subscriptionStatusLabel}</span>
          </div>
          <div className="settings-row settings-row-stacked">
            <span className="settings-label">Usage</span>
            <span className="settings-value">{usageLabel}</span>
          </div>
          {refinementLabel && (
            <div className="settings-row settings-row-stacked">
              <span className="settings-label">Refinements</span>
              <span className="settings-value settings-value-subtle">{refinementLabel}</span>
            </div>
          )}
          {loading && <p className="settings-note">Loading account data...</p>}
          {error && <p className="settings-error">{error}</p>}
          {currentPeriodEndLabel && (
            <div className="settings-row settings-row-stacked">
              <span className="settings-label">{cancelAtPeriodEndLikely ? 'Access until' : 'Renews on'}</span>
              <span className="settings-value">{currentPeriodEndLabel}</span>
            </div>
          )}
          {canManageSubscription ? (
            <>
              <p className="settings-note">Update payment method, cancel, or manage billing in Stripe.</p>
              <button
                type="button"
                className="btn-secondary settings-btn"
                onClick={() => void handleManageSubscription()}
                disabled={portalLoading}
              >
                {portalLoading ? 'Opening portal…' : 'Manage Subscription'}
              </button>
              {portalError && <p className="settings-error">{portalError}</p>}
            </>
          ) : (
            <>
              <p className="settings-note">Pro includes unlimited forms and 25 refinements monthly. Elite adds unlimited refinements ($11.99/mo).</p>
              <p className="settings-elite-proration-hint">
                {
                  'Upgrade to Elite — you\u2019ll only pay the prorated difference today. On Pro, we update your existing subscription (no second subscription).'
                }
              </p>
              <div className="settings-upgrade-row">
                <button
                  type="button"
                  className="btn-primary settings-btn"
                  onClick={() => void handleUpgrade('pro')}
                  disabled={checkoutLoading}
                >
                  {checkoutLoading ? 'Opening checkout…' : 'Upgrade to Pro — $8.99'}
                </button>
                <button
                  type="button"
                  className="btn-secondary settings-btn"
                  onClick={() => void handleUpgrade('elite')}
                  disabled={checkoutLoading}
                >
                  {checkoutLoading ? 'Opening checkout…' : 'Upgrade to Elite — $11.99'}
                </button>
              </div>
              {eliteInfoMsg && <p className="settings-note">{eliteInfoMsg}</p>}
              {checkoutError && <p className="settings-error">{checkoutError}</p>}
            </>
          )}
        </article>

        <article className="card settings-card">
          <h2 className="card-title">Session</h2>
          <p className="settings-note">End your current session on this device.</p>
          <button type="button" className="btn-secondary settings-btn settings-signout" onClick={() => void onSignOut()}>
            Sign Out
          </button>
        </article>

        <article className="card settings-card settings-support-card">
          <h2 className="card-title">Support</h2>
          <button
            type="button"
            className="btn-secondary settings-btn settings-support-btn"
            onClick={() => void handleViewTutorial()}
            disabled={tutorialReplayLoading}
          >
            {tutorialReplayLoading ? 'Resetting…' : 'Restart tutorial'}
          </button>
          <p className="settings-help-caption">Clears the one-time flag so the onboarding shows again on Coaching.</p>
          {tutorialReplayError && <p className="settings-error">{tutorialReplayError}</p>}
        </article>
      </section>
    </main>
  )
}
