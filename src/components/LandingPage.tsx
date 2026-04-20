import appIcon from '../assets/app-icon.png'
import '../landing.css'

/** Canonical hero line — this is what localhost:5173 must show for `/` (signed out). */
export const LANDING_HERO_HEADLINE = 'Write coaching forms in 10 seconds with AI'

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
          <h1 className="landing-hero-title">{LANDING_HERO_HEADLINE}</h1>
          <p className="landing-hero-lead">
            Built for Team Leads and managers. No more typing after long shifts — just enter what happened and
            get a clean, professional coaching form instantly.
          </p>

          <div className="landing-hero-demo" aria-label="Demo: user types input and AI generates a coaching form">
            <div className="landing-hero-demo-window">
              <div className="landing-hero-demo-header">
                <span className="landing-hero-demo-dot" />
                <span className="landing-hero-demo-dot" />
                <span className="landing-hero-demo-dot" />
                <span className="landing-hero-demo-title">Live demo</span>
              </div>
              <div className="landing-hero-demo-body">
                <div className="landing-hero-demo-input">
                  <p className="landing-hero-demo-label">You type:</p>
                  <p className="landing-hero-demo-text">
                    Late to shift twice this week. Missed two customer follow-ups.
                    <span className="landing-hero-demo-cursor" aria-hidden />
                  </p>
                </div>
                <div className="landing-hero-demo-output">
                  <p className="landing-hero-demo-label">AI form generated:</p>
                  <div className="landing-hero-demo-lines" aria-hidden>
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="landing-hero-ctas">
            <a className="landing-btn landing-btn--primary landing-btn--lg" href="/signup">
              Start Free Trial
            </a>
          </div>
          <p className="landing-hero-note">No credit card required</p>
        </section>

        <section className="landing-features" aria-labelledby="landing-features-heading">
          <h2 id="landing-features-heading" className="landing-section-title">
            Built for real leadership workflows
          </h2>
          <ul className="landing-feature-grid">
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Write coaching forms faster</h3>
              <p className="landing-feature-copy">
                Generate structured coaching and recognition output grounded in what your reps actually did—not
                generic filler.
              </p>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">No more typing after long shifts</h3>
              <p className="landing-feature-copy">
                Language and flow tuned for retail and sales leadership: fast to write, easy to deliver, ready
                to file.
              </p>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Professional wording instantly</h3>
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
