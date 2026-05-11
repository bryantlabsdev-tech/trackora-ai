import TermsOfServiceContent from './TermsOfServiceContent'

export default function TermsOfServicePage() {
  return (
    <div className="privacy-page">
      <div className="privacy-shell">
        <nav className="privacy-nav" aria-label="Page">
          <a href="/">← Home</a>
          <span className="privacy-nav-sep" aria-hidden>
            ·
          </span>
          <a href="/privacy">Privacy</a>
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
          <TermsOfServiceContent />
        </article>
      </div>
    </div>
  )
}
