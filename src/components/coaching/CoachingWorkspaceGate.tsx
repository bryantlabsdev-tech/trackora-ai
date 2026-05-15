import type { CoachingWorkspace } from '../../types/coaching'
import { WORKSPACE_LABEL } from '../../lib/workspaceLabels'

type Props = {
  coachingWorkspace: CoachingWorkspace
  onSelect: (workspace: CoachingWorkspace) => void
}

export function CoachingWorkspaceGate({ coachingWorkspace, onSelect }: Props) {
  return (
    <div
      className="workspace-gate-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-gate-title"
    >
      <div className="workspace-gate-backdrop" aria-hidden />
      <div className="workspace-gate-card card">
        <p className="workspace-gate-kicker">Get started</p>
        <h2 id="workspace-gate-title" className="workspace-gate-title">
          Choose your coaching workspace
        </h2>
        <p className="workspace-gate-lede">
          Trackora adapts topics, tone, and examples to your team. You can change this anytime in Settings.
        </p>
        <div className="workspace-picker-grid workspace-picker-grid--gate">
          <button
            type="button"
            className={'workspace-card' + (coachingWorkspace === 'mobile_sales' ? ' workspace-card--active' : '')}
            aria-pressed={coachingWorkspace === 'mobile_sales'}
            onClick={() => onSelect('mobile_sales')}
          >
            <span className="workspace-card-icon" aria-hidden>
              📱
            </span>
            <span className="workspace-card-title">{WORKSPACE_LABEL.mobile_sales}</span>
            <span className="workspace-card-desc">Wireless retail, metrics, floor coaching</span>
          </button>
          <button
            type="button"
            className={
              'workspace-card' + (coachingWorkspace === 'general_workplace' ? ' workspace-card--active' : '')
            }
            aria-pressed={coachingWorkspace === 'general_workplace'}
            onClick={() => onSelect('general_workplace')}
          >
            <span className="workspace-card-icon" aria-hidden>
              🧑‍💼
            </span>
            <span className="workspace-card-title">{WORKSPACE_LABEL.general_workplace}</span>
            <span className="workspace-card-desc">Offices, service, warehouses, and more</span>
          </button>
        </div>
        <p className="workspace-gate-foot">Tap a card to continue</p>
      </div>
    </div>
  )
}
