import type { RefObject } from 'react'
import type { CoachingWorkspace, FormMode, SimpleCoachingInput } from '../../types/coaching'
import type { Profile } from '../../types/profile'
import { WORKSPACE_TOPIC_GROUPS } from '../../data/coachingTopicGroups'
import { FREE_LIMIT_HEADLINE, PAYWALL_PRO_BULLETS } from '../../data/coachingPaywallCopy'
import {
  FREE_AI_GENERATION_LIMIT,
  PRO_MONTHLY_REFINEMENT_LIMIT,
  hasPremiumAccess,
  isElitePlan,
  isFreeLimitReached,
  isOwnerFreePro,
} from '../../types/profile'
import { UpgradeToProButton } from './UpgradeToProButton'
import type { TutorialPhase } from '../../data/coachingTutorial'

export type CoachingInputCardProps = {
  profile: Profile | null
  profileLoading: boolean
  profileError: string | null
  workspaceUI: (typeof import('../../data/coachingWorkspaceUi').WORKSPACE_UI)[CoachingWorkspace]
  coachingWorkspace: CoachingWorkspace
  quickTopicSelection: string
  onQuickTopicChange: (value: string) => void
  formMode: FormMode
  setFormMode: (mode: FormMode) => void
  input: SimpleCoachingInput
  setInput: React.Dispatch<React.SetStateAction<SimpleCoachingInput>>
  invalidName: boolean
  invalidReason: boolean
  tutorialHighlightQuickTopics: boolean
  tutorialPhase: TutorialPhase
  tutorialHighlightGenerate: boolean
  generateBtnRef: RefObject<HTMLButtonElement | null>
  loading: boolean
  generationBlocked: boolean
  onGenerate: () => void
  showValidation: boolean
  canGenerate: boolean
  generationError: string | null
  logText: string | null
  onOpenPricing: () => void
  onRefresh: () => void
}

export function CoachingInputCard(props: CoachingInputCardProps) {
  const {
    profile,
    profileLoading,
    profileError,
    workspaceUI,
    coachingWorkspace,
    quickTopicSelection,
    onQuickTopicChange,
    formMode,
    setFormMode,
    input,
    setInput,
    invalidName,
    invalidReason,
    tutorialHighlightQuickTopics,
    tutorialPhase,
    tutorialHighlightGenerate,
    generateBtnRef,
    loading,
    generationBlocked,
    onGenerate,
    showValidation,
    canGenerate,
    generationError,
    logText,
    onOpenPricing,
    onRefresh,
  } = props

  return (
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
                onClick={onOpenPricing}
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
                onClick={onOpenPricing}
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
          onClick={() => void onGenerate()}
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
              onBillingUpdated={() => void onRefresh()}
            />
            <UpgradeToProButton
              userId={profile.id}
              email={profile.email}
              checkoutPlan="elite"
              variant="outline"
              ctaLabel="Unlock Elite — $11.99"
              onBillingUpdated={() => void onRefresh()}
            />
          </div>
        </div>
      )}
    </section>
  )
}
