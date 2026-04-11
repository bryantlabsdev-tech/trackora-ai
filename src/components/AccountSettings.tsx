import { useMemo, useState } from 'react'
import { useProfile } from '../context/ProfileContext'
import { getCreateBillingPortalSessionUrl, getCreateCheckoutSessionUrl } from '../lib/apiBase'
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

  const planLabel = profile?.is_pro ? 'Pro' : 'Free'
  const usageLabel = useMemo(() => {
    if (!profile) return 'Loading usage...'
    if (profile.is_pro) return 'Pro Plan Active'
    return `${freeGenerationsRemainingLabel(profile)} (${profile.usage_count} used)`
  }, [profile])

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
    const trimmedUserId = userId.trim()
    if (!trimmedUserId) {
      setPortalError('Could not open billing portal: missing user id. Please sign in again.')
      return
    }
    if (!profile?.stripe_customer_id?.trim()) {
      setPortalError(
        'No Stripe customer on file yet. If you just upgraded, wait a minute and refresh. Otherwise contact support.',
      )
      return
    }

    setPortalError(null)
    setPortalLoading(true)
    try {
      const res = await fetch(getCreateBillingPortalSessionUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: trimmedUserId }),
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
          <p className="settings-note">Password updates are available in a future release.</p>
          <button
            type="button"
            className="btn-secondary settings-btn"
            onClick={() => window.alert('Change Password is coming soon.')}
          >
            Change Password
          </button>
        </article>

        <article className="card settings-card">
          <h2 className="card-title">Subscription</h2>
          {profile?.is_pro ? (
            <>
              <p className="settings-note">Update payment method, view invoices, or cancel in the Stripe customer portal.</p>
              <button
                type="button"
                className="btn-secondary settings-btn"
                onClick={() => void handleManageSubscription()}
                disabled={portalLoading || !profile?.stripe_customer_id?.trim()}
                title={!profile?.stripe_customer_id?.trim() ? 'Stripe customer ID not synced yet' : undefined}
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
