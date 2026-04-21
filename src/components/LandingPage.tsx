import appIcon from '../assets/app-icon.png'
import '../landing.css'

/** Canonical hero line — this is what localhost:5173 must show for `/` (signed out). */
export const LANDING_HERO_HEADLINE = 'Stop wasting 20 minutes writing coaching forms after every shift'

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
              Generate My First Coaching Form
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <p className="landing-eyebrow">AI coaching forms for leaders</p>
          <h1 className="landing-hero-title">{LANDING_HERO_HEADLINE}</h1>
          <p className="landing-hero-lead">
            Just type what happened — TrackoraAI instantly turns it into a clean, professional coaching form.
            No thinking. No rewriting. No stress.
          </p>
          <p className="landing-hero-urgency">
            If you&apos;re still writing coaching forms manually, you&apos;re wasting hours every month.
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
                    Employee was late to shift and missed 2 customer follow-ups
                    <span className="landing-hero-demo-cursor" aria-hidden />
                  </p>
                </div>
                <div className="landing-hero-demo-output">
                  <p className="landing-hero-demo-label">What you get:</p>
                  <p className="landing-hero-demo-text landing-hero-demo-text--output">
                    On [date], the employee arrived late to their scheduled shift and did not complete two
                    required customer follow-ups. This impacted workflow efficiency and customer experience.
                    Moving forward, punctual attendance and completion of assigned tasks is expected. Continued
                    occurrences may result in further corrective action.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="landing-hero-ctas">
            <a className="landing-btn landing-btn--primary landing-btn--lg" href="/signup">
              Generate My First Coaching Form
            </a>
          </div>
          <p className="landing-hero-note">
            No credit card required
            <br />
            Used by team leads to save hours every week
          </p>
        </section>

        <section className="landing-features" aria-labelledby="landing-features-heading">
          <h2 id="landing-features-heading" className="landing-section-title">
            Writing coaching forms shouldn&apos;t feel like this
          </h2>
          <ul className="landing-feature-grid">
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Struggling to find the right words after a long shift</h3>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Spending 15–30 minutes writing something simple</h3>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Not sure if it sounds professional enough</h3>
            </li>
          </ul>
        </section>

        <section className="landing-features landing-features--solutions" aria-labelledby="landing-solutions-heading">
          <h2 id="landing-solutions-heading" className="landing-section-title">
            TrackoraAI fixes that instantly
          </h2>
          <ul className="landing-feature-grid">
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Type what happened in plain English</h3>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Get a structured, professional coaching form</h3>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Copy and use it immediately</h3>
            </li>
          </ul>
        </section>

        <section className="landing-features landing-features--steps" aria-labelledby="landing-steps-heading">
          <h2 id="landing-steps-heading" className="landing-section-title">
            From quick note → professional coaching form in seconds
          </h2>
          <ul className="landing-feature-grid">
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Step 1:</h3>
              <p className="landing-feature-copy">Type what happened</p>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Step 2:</h3>
              <p className="landing-feature-copy">AI structures and cleans it</p>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Step 3:</h3>
              <p className="landing-feature-copy">Copy and use instantly</p>
            </li>
          </ul>
        </section>

        <section className="landing-features landing-features--comparison" aria-labelledby="landing-comparison-heading">
          <h2 id="landing-comparison-heading" className="landing-section-title">
            What used to take 20 minutes now takes 10 seconds
          </h2>
          <div className="landing-compare-grid">
            <article className="landing-feature-card landing-compare-card" aria-label="Before TrackoraAI">
              <h3 className="landing-feature-title">Before</h3>
              <ul className="landing-compare-list">
                <li>Thinking what to say</li>
                <li>Rewriting multiple times</li>
                <li>Wasting time after shift</li>
              </ul>
            </article>
            <article className="landing-feature-card landing-compare-card landing-compare-card--after" aria-label="After TrackoraAI">
              <h3 className="landing-feature-title">After</h3>
              <ul className="landing-compare-list">
                <li>Just type what happened</li>
                <li>Clean professional output instantly</li>
                <li>Done in seconds</li>
              </ul>
            </article>
          </div>
        </section>

        <section className="landing-features landing-features--trust" aria-labelledby="landing-trust-heading">
          <h2 id="landing-trust-heading" className="landing-section-title">
            Built for real team leads and managers
          </h2>
          <ul className="landing-feature-grid">
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Designed for retail and sales environments</h3>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">
                Works for daily coaching, write-ups, and documentation
              </h3>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Saves hours every week</h3>
            </li>
          </ul>
        </section>

        <section className="landing-features landing-features--risk" aria-labelledby="landing-risk-heading">
          <h2 id="landing-risk-heading" className="landing-section-title">
            Try it risk-free
          </h2>
          <ul className="landing-feature-grid">
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">No credit card required</h3>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Takes less than 10 seconds</h3>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Cancel anytime</h3>
            </li>
          </ul>
        </section>

        <section className="landing-trial" aria-labelledby="landing-trial-heading">
          <div className="landing-trial-inner">
            <h2 id="landing-trial-heading" className="landing-trial-title">
              Still writing coaching forms manually?
            </h2>
            <div className="landing-trial-ctas">
              <a className="landing-btn landing-btn--primary landing-btn--lg" href="/signup">
                Generate My First Coaching Form
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
