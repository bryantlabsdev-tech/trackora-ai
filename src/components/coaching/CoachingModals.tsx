import type { Profile } from '../../types/profile'
import {
  FREE_LIMIT_HEADLINE,
  PAYWALL_ELITE_BULLETS,
  PAYWALL_PRO_BULLETS,
  PRICING_MODAL_ELITE_BULLETS,
  PRICING_MODAL_FREE_BULLETS,
  PRICING_MODAL_PRO_BULLETS,
  REFINEMENT_LIMIT_HEADLINE,
  REFINEMENT_LIMIT_SUBTEXT,
} from '../../data/coachingPaywallCopy'
import { isElitePlan, isFreePlan, isProPlan } from '../../types/profile'
import { UpgradeToProButton } from './UpgradeToProButton'

type Props = {
  profile: Profile | null
  freeLimitBody: string
  showRefinementLimitModal: boolean
  onCloseRefinementLimit: () => void
  showLimitPaywall: boolean
  onCloseLimitPaywall: () => void
  showPricingModal: boolean
  onClosePricingModal: () => void
  showWarmupNotice: boolean
  copyFormToast: boolean
  onBillingUpdated: () => void
}

export function CoachingModals({
  profile,
  freeLimitBody,
  showRefinementLimitModal,
  onCloseRefinementLimit,
  showLimitPaywall,
  onCloseLimitPaywall,
  showPricingModal,
  onClosePricingModal,
  showWarmupNotice,
  copyFormToast,
  onBillingUpdated,
}: Props) {
  if (!profile) return null

  return (
    <>
      {showRefinementLimitModal && (
        <div className="paywall-modal-root" role="presentation">
          <button
            type="button"
            className="paywall-modal-backdrop"
            aria-label="Close refinement limit notice"
            onClick={onCloseRefinementLimit}
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
              <button type="button" className="btn-primary btn-plan-upgrade" onClick={onCloseRefinementLimit}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {showLimitPaywall && (
        <div className="paywall-modal-root" role="presentation">
          <button
            type="button"
            className="paywall-modal-backdrop"
            aria-label="Close paywall"
            onClick={onCloseLimitPaywall}
          />
          <div className="paywall-modal card paywall-modal--premium" role="dialog" aria-modal="true" aria-labelledby="paywall-title">
            <div className="paywall-modal-head">
              <h2 id="paywall-title" className="paywall-title">
                {FREE_LIMIT_HEADLINE}
              </h2>
            </div>
            <p className="paywall-body">{freeLimitBody}</p>
            <div className="paywall-plan-pick" role="group" aria-label="Choose a plan">
              <div className="paywall-plan-card paywall-plan-card--pro">
                <span className="paywall-plan-kicker">Pro</span>
                <p className="paywall-plan-price">
                  $8.99<span className="paywall-plan-per">/mo</span>
                </p>
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
                  onBillingUpdated={onBillingUpdated}
                />
              </div>
              <div className="paywall-plan-card paywall-plan-card--elite">
                <span className="paywall-plan-kicker paywall-plan-kicker--elite">Elite</span>
                <p className="paywall-plan-price">
                  $11.99<span className="paywall-plan-per">/mo</span>
                </p>
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
                  onBillingUpdated={onBillingUpdated}
                />
              </div>
            </div>
            <p className="paywall-trust">Cancel anytime from Settings.</p>
            <div className="paywall-actions">
              <button type="button" className="btn-text paywall-secondary" onClick={onCloseLimitPaywall}>
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}

      {showPricingModal && (
        <div className="pricing-modal-root" role="presentation">
          <button type="button" className="pricing-modal-backdrop" aria-label="Close plans" onClick={onClosePricingModal} />
          <div className="pricing-modal-panel" role="dialog" aria-modal="true" aria-labelledby="pricing-modal-title">
            <div className="pricing-modal-header">
              <div>
                <h2 id="pricing-modal-title" className="pricing-modal-title">
                  Plans
                </h2>
                <p className="pricing-modal-lede">Pick the tier that fits how often you refine. Cancel anytime from Settings.</p>
              </div>
              <button type="button" className="pricing-modal-close" aria-label="Close" onClick={onClosePricingModal}>
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
                  <button type="button" className="btn-secondary pricing-tier-cta pricing-tier-cta--current" disabled>
                    {isFreePlan(profile, profile.email) ? 'Current plan' : 'Start free'}
                  </button>
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
                        onClosePricingModal()
                        onBillingUpdated()
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
                    <button
                      type="button"
                      className="btn-primary pricing-tier-cta pricing-tier-cta--elite pricing-tier-cta--current"
                      disabled
                    >
                      Current plan
                    </button>
                  ) : (
                    <UpgradeToProButton
                      userId={profile.id}
                      email={profile.email}
                      checkoutPlan="elite"
                      ctaLabel="Choose Elite"
                      onBillingUpdated={() => {
                        onClosePricingModal()
                        onBillingUpdated()
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
          <p className="warmup-toast-text">First AI request may take up to a minute while the server wakes up.</p>
        </div>
      )}

      {copyFormToast && (
        <div className="copy-form-toast" role="status" aria-live="polite">
          Coaching form copied successfully.
        </div>
      )}
    </>
  )
}
