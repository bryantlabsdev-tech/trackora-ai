import { useEffect } from 'react'
import appIcon from '../assets/app-icon.png'
import '../landing.css'

const PAGE_TITLE = 'TrackoraAI - Coaching Forms in Seconds'
const PAGE_DESCRIPTION =
  'Create structured coaching forms fast. Built for team leads and managers.'

export default function AdsLandingPage() {
  useEffect(() => {
    const prevTitle = document.title
    document.title = PAGE_TITLE

    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null
    let createdMeta = false
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'description')
      document.head.appendChild(meta)
      createdMeta = true
    }
    const prevDescription = meta.getAttribute('content')
    meta.setAttribute('content', PAGE_DESCRIPTION)

    return () => {
      document.title = prevTitle
      if (createdMeta && meta?.parentNode) {
        meta.parentNode.removeChild(meta)
      } else if (meta) {
        if (prevDescription == null || prevDescription === '') {
          meta.removeAttribute('content')
        } else {
          meta.setAttribute('content', prevDescription)
        }
      }
    }
  }, [])

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-header-inner">
          <a className="landing-brand" href="/landing">
            <img src={appIcon} alt="" width={36} height={36} className="landing-brand-icon" />
            <span className="landing-brand-text">TrackoraAI</span>
          </a>
          <nav className="landing-header-nav" aria-label="Account">
            <a className="landing-link" href="/login">
              Log In
            </a>
            <a className="landing-btn landing-btn--primary" href="/signup">
              Try It Free
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="ads-hero-title">
          <p className="landing-eyebrow">For team leads &amp; managers</p>
          <h1 id="ads-hero-title" className="landing-hero-title">
            Create coaching forms in seconds
          </h1>
          <p className="landing-hero-lead">
            Built for team leads and managers who need clean, professional coaching forms without writing
            everything from scratch.
          </p>
          <div className="landing-trial-ctas" style={{ marginBottom: '1.75rem' }}>
            <a className="landing-btn landing-btn--primary landing-btn--lg" href="/signup">
              Try It Free
            </a>
            <a className="landing-btn landing-btn--outline landing-btn--lg" href="#how-it-works">
              See How It Works
            </a>
          </div>

          <div className="landing-hero-demo" aria-label="Product preview">
            <div className="landing-hero-demo-window">
              <div className="landing-hero-demo-header">
                <span className="landing-hero-demo-dot" />
                <span className="landing-hero-demo-dot" />
                <span className="landing-hero-demo-dot" />
                <span className="landing-hero-demo-title">TrackoraAI</span>
              </div>
              <div className="landing-hero-demo-body">
                <div className="landing-hero-demo-input">
                  <label className="landing-hero-demo-label" htmlFor="ads-demo-readonly">
                    What happened?
                  </label>
                  <textarea
                    id="ads-demo-readonly"
                    className="landing-hero-demo-textarea"
                    readOnly
                    rows={4}
                    defaultValue="Example: Missed follow-ups on customer commitments after promising callbacks."
                  />
                  <p className="landing-hero-trust-line">After signup, generate full forms in one click.</p>
                </div>
                <div className="landing-hero-demo-output">
                  <p className="landing-hero-demo-label">Sample output</p>
                  <div className="landing-preview-content">
                    <article className="landing-preview-block">
                      <h3>Situation</h3>
                      <p>Plain-language summary of what occurred and the context your team needs.</p>
                    </article>
                    <article className="landing-preview-block">
                      <h3>Next steps</h3>
                      <p>Actionable bullets you can paste into HR tools or send as follow-up.</p>
                    </article>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-features" aria-labelledby="ads-benefits-title">
          <h2 id="ads-benefits-title" className="landing-section-title">
            Why managers use TrackoraAI
          </h2>
          <ul className="landing-feature-grid ads-landing-benefit-grid">
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Save time</h3>
              <p className="landing-feature-copy">Save time writing coaching forms</p>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Clear talking points</h3>
              <p className="landing-feature-copy">Create clear talking points</p>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Structured next steps</h3>
              <p className="landing-feature-copy">Generate structured next steps</p>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Consistent coaching</h3>
              <p className="landing-feature-copy">Keep coaching consistent</p>
            </li>
          </ul>
        </section>

        <section
          id="how-it-works"
          className="landing-features landing-features--solutions"
          aria-labelledby="ads-how-title"
        >
          <h2 id="ads-how-title" className="landing-section-title">
            How it works
          </h2>
          <ol className="ads-how-steps">
            <li>
              <span className="ads-how-step-num">1</span>
              <div>
                <h3 className="landing-feature-title">Enter employee name</h3>
                <p className="landing-feature-copy">Who is this coaching conversation for?</p>
              </div>
            </li>
            <li>
              <span className="ads-how-step-num">2</span>
              <div>
                <h3 className="landing-feature-title">Add coaching reason</h3>
                <p className="landing-feature-copy">Describe the situation in plain language.</p>
              </div>
            </li>
            <li>
              <span className="ads-how-step-num">3</span>
              <div>
                <h3 className="landing-feature-title">Generate a professional coaching form</h3>
                <p className="landing-feature-copy">Get a polished, structured form you can use right away.</p>
              </div>
            </li>
          </ol>
        </section>

        <section className="landing-features landing-features--risk" aria-labelledby="ads-trust-title">
          <h2 id="ads-trust-title" className="landing-section-title">
            Built for real leadership work
          </h2>
          <ul className="landing-compare-list" style={{ maxWidth: '36rem', margin: '0 auto' }}>
            <li>No complicated setup</li>
            <li>Built for managers and team leads</li>
            <li>Professional coaching output in seconds</li>
          </ul>
        </section>

        <section className="landing-trial" aria-labelledby="ads-final-cta-title">
          <div className="landing-trial-inner">
            <h2 id="ads-final-cta-title" className="landing-trial-title">
              Start creating coaching forms today
            </h2>
            <p className="landing-trial-copy">
              Sign up free and turn your notes into clear, professional coaching forms.
            </p>
            <div className="landing-trial-ctas">
              <a className="landing-btn landing-btn--primary landing-btn--lg" href="/signup">
                Try It Free
              </a>
              <a className="landing-btn landing-btn--ghost landing-btn--lg" href="/login">
                Log In
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p className="landing-footer-copy">TrackoraAI — coaching forms for high-performing teams.</p>
      </footer>
    </div>
  )
}
