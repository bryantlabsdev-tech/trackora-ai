import appIcon from '../assets/app-icon.png'
import '../landing.css'

export default function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-header-inner">
          <a className="landing-brand" href="/">
            <img src={appIcon} alt="" width={36} height={36} className="landing-brand-icon" />
            <span className="landing-brand-text">TrackoraAI</span>
          </a>
          <nav className="landing-header-nav" aria-label="Account">
            <a className="landing-link" href="/login">
              Log In
            </a>
            <a className="landing-btn landing-btn--primary" href="/signup">
              Start Free Trial
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <p className="landing-eyebrow">AI coaching forms for leaders</p>
          <h1 className="landing-hero-title">
            Structured coaching &amp; recognition, <span className="landing-hero-accent">in seconds</span>
          </h1>
          <p className="landing-hero-lead">
            TrackoraAI is an AI-powered coaching form generator built for sales teams and store leaders. Save
            time on documentation while keeping feedback clear, consistent, and ready to use.
          </p>
          <div className="landing-hero-ctas">
            <a className="landing-btn landing-btn--primary landing-btn--lg" href="/signup">
              Start Free Trial
            </a>
            <a className="landing-btn landing-btn--ghost landing-btn--lg" href="/login">
              Log In
            </a>
            <a className="landing-btn landing-btn--outline landing-btn--lg" href="/app">
              Open App
            </a>
          </div>
          <p className="landing-hero-note">
            New here? Start a trial to create your account. Already use Trackora? Log in or open the app.
          </p>
        </section>

        <section className="landing-features" aria-labelledby="landing-features-heading">
          <h2 id="landing-features-heading" className="landing-section-title">
            Built for real leadership workflows
          </h2>
          <ul className="landing-feature-grid">
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">AI-powered drafts</h3>
              <p className="landing-feature-copy">
                Generate structured coaching and recognition output grounded in what your reps actually did—not
                generic filler.
              </p>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Built for sales teams</h3>
              <p className="landing-feature-copy">
                Language and flow tuned for retail and sales leadership: fast to write, easy to deliver, ready
                to file.
              </p>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Save hours every week</h3>
              <p className="landing-feature-copy">
                Spend less time wrestling with wording and more time on the floor. Copy section-by-section or
                take the full form.
              </p>
            </li>
          </ul>
        </section>

        <section className="landing-trial" aria-labelledby="landing-trial-heading">
          <div className="landing-trial-inner">
            <h2 id="landing-trial-heading" className="landing-trial-title">
              Ready to try TrackoraAI?
            </h2>
            <p className="landing-trial-copy">
              Create an account to start your free trial. Upgrade when you need more—manage billing anytime from
              account settings.
            </p>
            <div className="landing-trial-ctas">
              <a className="landing-btn landing-btn--primary landing-btn--lg" href="/signup">
                Start Free Trial
              </a>
              <a className="landing-btn landing-btn--ghost landing-btn--lg" href="/app">
                Open App
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p className="landing-footer-copy">© {new Date().getFullYear()} TrackoraAI</p>
      </footer>
    </div>
  )
}
