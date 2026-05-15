import { TUTORIAL_STEPS, type TutorialPhase } from '../../data/coachingTutorial'
import type { TutorialStep } from '../../data/coachingTutorial'

type Props = {
  tutorialPhase: TutorialPhase
  tutorialStepIndex: number
  tutorialStep: TutorialStep
  logText: string | null
  tutorialDismissBusy: boolean
  tutorialDismissError: string | null
  onTutorialBack: () => void
  onTutorialNext: () => void
  onTutorialStartGenerating: () => void
  onDismissTutorial: () => void
}

export function CoachingTutorialOverlay({
  tutorialPhase,
  tutorialStepIndex,
  tutorialStep,
  logText,
  tutorialDismissBusy,
  tutorialDismissError,
  onTutorialBack,
  onTutorialNext,
  onTutorialStartGenerating,
  onDismissTutorial,
}: Props) {
  return (
    <>
      {tutorialPhase === 'walkthrough' && (
        <div
          className="tutorial-welcome-root"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tutorial-welcome-title"
        >
          <div className="tutorial-welcome-backdrop" aria-hidden />
          <div className="tutorial-welcome-card card">
            <p className="tutorial-step-kicker">
              Step {tutorialStepIndex + 1} of {TUTORIAL_STEPS.length}
            </p>
            <h2 id="tutorial-welcome-title" className="tutorial-welcome-headline">
              {tutorialStep.title}
            </h2>
            <p className="tutorial-welcome-lede">{tutorialStep.body}</p>
            {tutorialStep.support && <p className="tutorial-note">{tutorialStep.support}</p>}
            {tutorialStepIndex === TUTORIAL_STEPS.length - 1 && (
              <p className="tutorial-note">Build stronger coaching in less time — starting with your next shift.</p>
            )}
            <div className="tutorial-actions-row">
              {tutorialStepIndex > 0 && (
                <button type="button" className="btn-secondary tutorial-back-btn" onClick={onTutorialBack}>
                  Back
                </button>
              )}
              {tutorialStepIndex < TUTORIAL_STEPS.length - 1 ? (
                <button type="button" className="btn-primary tutorial-welcome-cta" onClick={onTutorialNext}>
                  Continue
                </button>
              ) : (
                <button type="button" className="btn-primary tutorial-welcome-cta" onClick={onTutorialStartGenerating}>
                  Start generating
                </button>
              )}
            </div>
            <div className="tutorial-skip-row">
              <button
                type="button"
                className="btn-text tutorial-skip-btn"
                disabled={tutorialDismissBusy}
                onClick={() => void onDismissTutorial()}
              >
                {tutorialDismissBusy ? 'Saving…' : 'Skip tutorial'}
              </button>
            </div>
            {tutorialDismissError && (
              <p className="tutorial-dismiss-error" role="alert">
                {tutorialDismissError}
              </p>
            )}
          </div>
        </div>
      )}

      {tutorialPhase === 'spotlight_output' && logText && (
        <div className="tutorial-output-hud">
          <p className="tutorial-output-label">Your form</p>
          {tutorialDismissError && (
            <p className="tutorial-dismiss-error tutorial-dismiss-error--hud" role="alert">
              {tutorialDismissError}
            </p>
          )}
          <button
            type="button"
            className="tutorial-done-btn"
            disabled={tutorialDismissBusy}
            onClick={() => void onDismissTutorial()}
          >
            {tutorialDismissBusy ? 'Saving…' : 'Done'}
          </button>
        </div>
      )}
    </>
  )
}
