import { useState } from 'react'
import { startEliteUpgrade } from '../../api/startEliteUpgrade'
import { getCreateCheckoutSessionUrl } from '../../lib/apiBase'

const ELITE_PRORATION_HINT =
  'Upgrade to Elite — you\u2019ll only pay the prorated difference today.'

export type UpgradeToProButtonProps = {
  userId: string
  email: string
  /** Defaults to "Upgrade to Pro" — use "Unlock Pro" on free-limit surfaces */
  ctaLabel?: string
  checkoutPlan?: 'pro' | 'elite'
  variant?: 'primary' | 'outline'
  /** After Pro → Elite proration upgrade succeeds (same subscription). */
  onBillingUpdated?: () => void
}

export function UpgradeToProButton({
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
