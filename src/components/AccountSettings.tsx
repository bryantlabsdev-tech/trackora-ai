import { useMemo, useState } from 'react'
import { useProfile } from '../context/ProfileContext'
import { getCreateBillingPortalSessionUrl, getCreateCheckoutSessionUrl } from '../lib/apiBase'
import { supabase } from '../lib/supabase'
import { freeGenerationsRemainingLabel } from '../types/profile'

type AccountSettingsProps = {
  userId: string
  email: string | null
  onSignOut: () => Promise<void>
}

export default function AccountSettings({ userId, email, onSignOut }: AccountSettingsProps) {
  const { profile, loading, error } = useProfile()
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordInfo, setPasswordInfo] = useState<string | null>(null)

  const planLabel = profile?.is_pro ? 'Pro' : 'Free'
  const usageLabel = useMemo(() => {
    if (!profile) return 'Loading usage...'
    if (profile.is_pro) return 'Pro Plan Active'
    return `${freeGenerationsRemainingLabel(profile)} (${profile.usage_count} used)`
  }, [profile])
  const canManageSubscription = Boolean(
    profile?.is_pro ||
      profile?.stripe_customer_id?.trim() ||
      profile?.stripe_subscription_id?.trim() ||
      profile?.subscription_status?.trim(),
  )
  const subscriptionStatusLabel = profile?.subscription_status?.trim() || (profile?.is_pro ? 'active' : 'none')
  const currentPeriodEndLabel = useMemo(() => {
    if (!profile?.current_period_end) return null
    const d = new Date(profile.current_period_end)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleDateString()
  }, [profile?.current_period_end])
  const cancelAtPeriodEndLikely =
    profile?.subscription_status === 'canceled' && Boolean(profile?.current_period_end)

  async function handleUpgrade() {
    const trimmedUserId = userId.trim()
    if (!trimmedUserId) {
      setCheckoutError('Could not start checkout: missing user id. Please sign in again.')
      return
    }

    setCheckoutError(null)
    setCheckoutLoading(true)
    try {
      const payload = { userId: trimmedUserId, email: (email ?? '').trim() }
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
          <h2 className="card-title">Plan</h2>
          <div className="settings-row">
            <span className="settings-label">Current Plan</span>
            <span className={'settings-pill ' + (profile?.is_pro ? 'is-pro' : 'is-free')}>{planLabel}</span>
          </div>
          <div className="settings-row settings-row-stacked">
            <span className="settings-label">Usage</span>
            <span className="settings-value">{usageLabel}</span>
          </div>
          {loading && <p className="settings-note">Loading account data...</p>}
          {error && <p className="settings-error">{error}</p>}
        </article>

        <article className="card settings-card">
          <h2 className="card-title">Security</h2>
          <p className="settings-note">Send yourself a secure password reset link using Supabase.</p>
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
            <span className="settings-label">Plan</span>
            <span className={'settings-pill ' + (profile?.is_pro ? 'is-pro' : 'is-free')}>{planLabel}</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Status</span>
            <span className="settings-value">{subscriptionStatusLabel}</span>
          </div>
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
              <p className="settings-note">Upgrade for unlimited AI generations.</p>
              <button type="button" className="btn-primary settings-btn" onClick={() => void handleUpgrade()} disabled={checkoutLoading}>
                {checkoutLoading ? 'Opening checkout…' : 'Upgrade to Pro'}
              </button>
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
      </section>
    </main>
  )
}
