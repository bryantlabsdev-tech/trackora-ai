import type { RefObject } from 'react'
import type { CoachingFormSectionLabel, FormMode, RefinePreset } from '../../types/coaching'
import type { Profile } from '../../types/profile'
import {
  documentSectionTitle,
  formatGenerationBadgeLabel,
  OutputNextStepsBody,
  REFINABLE_SECTION_IDS,
  REFINE_QUICK_OPTIONS,
  SectionCopyIcon,
} from './coachingOutputUi'
import { sectionClipboardHasContent } from '../../lib/formatCoachingFormClipboard'
import type { TutorialPhase } from '../../data/coachingTutorial'

export type ParsedSection = { id: string; body: string }

export type CoachingOutputPanelProps = {
  outputCardRef: RefObject<HTMLElement | null>
  tutorialPhase: TutorialPhase
  loading: boolean
  logText: string | null
  logSource: 'openai' | 'deterministic' | 'fallback' | null
  lastGenerationMs: number | null
  workspaceUI: { outputLoadingCaption: string; outputEmptySub: string }
  generationError: string | null
  parsedSections: ParsedSection[]
  copyEntireSuccess: boolean
  onCopyEntireForm: () => void
  refinementQuota: { canRefine: boolean }
  refiningRowKey: string | null
  generationBlocked: boolean
  profileLoading: boolean
  profile: Profile | null
  refinePresetPick: RefinePreset | null
  setRefinePresetPick: (p: RefinePreset | null) => void
  refineCustomText: string
  setRefineCustomText: (t: string) => void
  refineOpenRowKey: string | null
  setRefineOpenRowKey: React.Dispatch<React.SetStateAction<string | null>>
  refinedFlashKeys: Record<string, boolean>
  copiedSectionKeys: Record<string, boolean>
  onCopySection: (rowKey: string, sectionLabel: string, body: string) => void
  onApplyRefinement: (sectionId: CoachingFormSectionLabel, rowKey: string, body: string) => void
  onRegenerate: () => void
  outputHelpfulness: 'yes' | 'no' | null
  setOutputHelpfulness: (v: 'yes' | 'no' | null) => void
}

export function CoachingOutputPanel(props: CoachingOutputPanelProps) {
  const {
    outputCardRef,
    tutorialPhase,
    loading,
    logText,
    logSource,
    lastGenerationMs,
    workspaceUI,
    generationError,
    parsedSections,
    copyEntireSuccess,
    onCopyEntireForm,
    refinementQuota,
    refiningRowKey,
    generationBlocked,
    profileLoading,
    profile,
    refinePresetPick,
    setRefinePresetPick,
    refineCustomText,
    setRefineCustomText,
    refineOpenRowKey,
    setRefineOpenRowKey,
    refinedFlashKeys,
    copiedSectionKeys,
    onCopySection,
    onApplyRefinement,
    onRegenerate,
    outputHelpfulness,
    setOutputHelpfulness,
  } = props

  return (
    <section
      className={
        'card output-card' + (tutorialPhase === 'spotlight_output' ? ' is-tutorial-spotlight' : '')
      }
      ref={outputCardRef}
    >
      <div className="output-top">
        {!loading && logText ? (
          <div className="output-panel-head">
            <div className="output-panel-head-row">
              <div className="output-panel-head-left">
                <h2 className="output-panel-title">
                  {logSource === 'openai' ? 'Assistant Draft' : 'Coaching Draft'}
                </h2>
                {lastGenerationMs != null && (
                  <span className="output-gen-badge">{formatGenerationBadgeLabel(lastGenerationMs, logSource)}</span>
                )}
              </div>
              {tutorialPhase === 'off' && (
                <button
                  type="button"
                  className={'btn-copy-entire btn-copy-entire--primary' + (copyEntireSuccess ? ' is-success' : '')}
                  onClick={() => void onCopyEntireForm()}
                >
                  {copyEntireSuccess ? (
                    <span className="btn-copy-entire-check" aria-hidden>
                      ✓
                    </span>
                  ) : null}
                  Copy entire form
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="output-top-row output-top-row--placeholder">
            <h2 className="card-title">Output</h2>
          </div>
        )}
      </div>
      {loading && (
        <div className="output-loading-premium" aria-busy="true" aria-live="polite">
          <p className="output-loading-caption">{workspaceUI.outputLoadingCaption}</p>
          <div className="output-document output-document--loading">
            <div className="output-skeleton-doc">
              <div className="output-skeleton-line output-skeleton-line--title" />
              <div className="output-skeleton-section">
                <div className="output-skeleton-chip" />
                <div className="output-skeleton-line" />
                <div className="output-skeleton-line output-skeleton-line--medium" />
                <div className="output-skeleton-line output-skeleton-line--short" />
              </div>
              <div className="output-skeleton-section output-skeleton-section--delayed">
                <div className="output-skeleton-chip output-skeleton-chip--narrow" />
                <div className="output-skeleton-line" />
                <div className="output-skeleton-line" />
                <div className="output-skeleton-line output-skeleton-line--short" />
              </div>
              <div className="output-skeleton-section output-skeleton-section--delayed2">
                <div className="output-skeleton-chip output-skeleton-chip--narrow" />
                <div className="output-skeleton-line output-skeleton-line--medium" />
                <div className="output-skeleton-line" />
              </div>
            </div>
          </div>
        </div>
      )}
      {!loading && !logText && (
        <div className="output-empty-premium">
          <div className="output-empty-doc">
            <div className="output-empty-icon" aria-hidden>
              <svg viewBox="0 0 48 56" width="48" height="56" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M12 4h18l10 10v34a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  opacity="0.35"
                />
                <path d="M30 4v10h10" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
                <path d="M16 24h16M16 30h12M16 36h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
              </svg>
            </div>
            <h3 className="output-empty-title">Your AI-generated coaching form will appear here</h3>
            <p className="output-empty-sub">{workspaceUI.outputEmptySub}</p>
          </div>
        </div>
      )}
      {!loading && logText && (
        <div className="output-result-fade">
          {generationError && (
            <p className="hint-error output-inline-error" role="alert">
              {generationError}
            </p>
          )}
          {logSource === 'deterministic' && (
            <p className="output-fallback-notice" role="status">
              ⚠️ AI unavailable — showing backup coaching
            </p>
          )}
          <div className="output-document">
            <div className="output-doc-summary" role="status">
              <span className="output-doc-summary-lead">
                <svg className="output-doc-summary-check" width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06l2.72 2.72 6.72-6.72a.75.75 0 0 1 1.06 0z"
                  />
                </svg>
                Coaching form ready
              </span>
              {lastGenerationMs != null && (
                <>
                  <span className="output-doc-summary-sep" aria-hidden />
                  <span className="output-doc-summary-meta">{formatGenerationBadgeLabel(lastGenerationMs, logSource)}</span>
                </>
              )}
              <span className="output-doc-summary-sep" aria-hidden />
              <span className="output-doc-summary-tail">Ready to copy or refine</span>
            </div>

            <div className="output-doc-sections">
              {parsedSections.map((sec, i) => {
                const rowKey = `${sec.id}-${i}`
                const canCopy = sectionClipboardHasContent(sec.id, sec.body)
                const title = documentSectionTitle(sec.id)
                const canRefine =
                  tutorialPhase === 'off' &&
                  REFINABLE_SECTION_IDS.has(sec.id) &&
                  refinementQuota.canRefine
                const sectionLabel = sec.id as CoachingFormSectionLabel
                const applyDisabled =
                  refiningRowKey !== null ||
                  generationBlocked ||
                  profileLoading ||
                  !profile ||
                  (!refinePresetPick && !refineCustomText.trim())
                return (
                  <article
                    key={rowKey}
                    className={
                      'output-doc-section' +
                      (refiningRowKey === rowKey ? ' is-section-refining' : '') +
                      (refinedFlashKeys[rowKey] ? ' is-section-refined-flash' : '')
                    }
                  >
                    <div className="output-doc-section-head">
                      <span className="output-doc-section-accent" aria-hidden />
                      <h3 className="output-doc-section-title">{title}</h3>
                      {refinedFlashKeys[rowKey] && (
                        <span className="output-refine-done-badge" role="status">
                          Refined
                        </span>
                      )}
                      {canRefine && (
                        <button
                          type="button"
                          className={
                            'btn-section-refine' + (refineOpenRowKey === rowKey ? ' is-open' : '')
                          }
                          aria-expanded={refineOpenRowKey === rowKey}
                          onClick={() => {
                            setRefineOpenRowKey((k) => {
                              if (k === rowKey) {
                                return null
                              }
                              setRefinePresetPick(null)
                              setRefineCustomText('')
                              return rowKey
                            })
                          }}
                        >
                          Refine
                        </button>
                      )}
                      <button
                        type="button"
                        className={
                          'btn-section-copy-icon' + (copiedSectionKeys[rowKey] ? ' is-copied' : '')
                        }
                        disabled={!canCopy}
                        title={canCopy ? `Copy ${sec.id}` : 'Nothing to copy in this section'}
                        aria-label={canCopy ? `Copy ${sec.id}` : 'Nothing to copy in this section'}
                        onClick={() => void onCopySection(rowKey, sec.id, sec.body)}
                      >
                        <SectionCopyIcon copied={Boolean(copiedSectionKeys[rowKey])} />
                      </button>
                    </div>
                    {canRefine && refineOpenRowKey === rowKey && (
                      <div className="output-refine-panel">
                        <p className="output-refine-label">Quick refinements</p>
                        <div className="output-refine-chips" role="group" aria-label="Quick refinements">
                          {REFINE_QUICK_OPTIONS.map((o) => (
                            <button
                              key={o.preset}
                              type="button"
                              className={
                                'output-refine-chip' + (refinePresetPick === o.preset ? ' is-selected' : '')
                              }
                              onClick={() => setRefinePresetPick(o.preset)}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                        <label className="output-refine-custom-label">
                          <span className="output-refine-custom-title">
                            Tell TrackoraAI how to refine this section…
                          </span>
                          <textarea
                            className="field-control output-refine-textarea"
                            rows={2}
                            value={refineCustomText}
                            onChange={(e) => setRefineCustomText(e.target.value)}
                            placeholder="Optional details for this section only"
                          />
                        </label>
                        <button
                          type="button"
                          className="btn-primary output-refine-apply"
                          disabled={applyDisabled}
                          onClick={() => void onApplyRefinement(sectionLabel, rowKey, sec.body)}
                        >
                          {refiningRowKey === rowKey ? (
                            <>
                              <span className="spinner" aria-hidden />
                              Refining…
                            </>
                          ) : (
                            'Apply refinement'
                          )}
                        </button>
                      </div>
                    )}
                    <div className="output-doc-section-body">
                      {sec.id === 'Next Steps' ? (
                        <OutputNextStepsBody body={sec.body} />
                      ) : (
                        <div className="output-doc-text">{sec.body}</div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </div>

          {tutorialPhase === 'off' && (
            <div className="output-actions-row">
              <button
                type="button"
                className="btn-output-regenerate"
                disabled={loading || generationBlocked}
                onClick={() => onRegenerate()}
              >
                Regenerate
              </button>
            </div>
          )}
          {tutorialPhase === 'off' && (
            <div
              className={
                'output-helpfulness' +
                (outputHelpfulness === 'yes' ? ' output-helpfulness--yes' : '')
              }
              role="group"
              aria-label="Was this coaching output helpful"
            >
              <p className="output-helpfulness-q">Was this useful?</p>
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
                  Send feedback
                </button>
              </div>
              {outputHelpfulness === 'yes' && (
                <p className="output-helpfulness-thanks" role="status" aria-live="polite">
                  Thanks — glad this helped.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
