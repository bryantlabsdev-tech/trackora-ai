import PrivacyPolicyContent from './PrivacyPolicyContent'

export default function PrivacyPolicyPage() {
  return (
    <div className="privacy-page">
      <div className="privacy-shell">
        <nav className="privacy-nav" aria-label="Page">
          <a href="/">← Home</a>
          <span className="privacy-nav-sep" aria-hidden>
            ·
          </span>
          <a href="/terms">Terms</a>
          <span className="privacy-nav-sep" aria-hidden>
            ·
          </span>
          <a href="/login">Log in</a>
          <span className="privacy-nav-sep" aria-hidden>
            ·
          </span>
          <a href="/signup">Sign up</a>
          <span className="privacy-nav-sep" aria-hidden>
            ·
          </span>
          <a href="/app">Open app</a>
        </nav>

        <article className="card privacy-card">
          <PrivacyPolicyContent />
        </article>
      </div>
    </div>
  )
}
