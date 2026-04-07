import './App.css'
import './auth.css'

export default function CheckoutSuccess() {
  const sessionId =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('session_id') : null

  return (
    <div className="auth-screen">
      <div className="auth-card card">
        <p className="eyebrow">Trackora</p>
        <h1 className="auth-title">You&apos;re all set</h1>
        <p className="auth-subtitle">
          Your checkout completed. Return to the app to keep generating coaching forms.
        </p>
        {sessionId && (
          <p className="auth-config-hint" style={{ marginBottom: '1rem' }}>
            Reference: <code>{sessionId}</code>
          </p>
        )}
        <a className="btn-primary btn-plan-upgrade" href="/">
          Back to app
        </a>
      </div>
    </div>
  )
}
