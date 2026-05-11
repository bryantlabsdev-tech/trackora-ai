import appIcon from '../assets/app-icon.png'
import '../landing.css'
import { useMemo, useState } from 'react'

/** Canonical hero line — this is what localhost:5173 must show for `/` (signed out). */
export const LANDING_HERO_HEADLINE = 'Create professional coaching and recognition forms in seconds'
const DEMO_STORAGE_KEY = 'trackoraai_demo_generation_count'
const DEMO_GENERATION_LIMIT = 3

type PreviewResult = {
  summary: string
  impact: string
  expectation: string
}

const QUICK_EXAMPLES = ['Late to shift', 'Missed sales goal', 'Poor follow-up'] as const

const PREVIEW_EXAMPLES: Record<string, PreviewResult> = {
  late: {
    summary:
      'The employee arrived late to a scheduled shift and was not ready to support opening priorities on time.',
    impact:
      'Late arrival delayed team coverage, increased pressure on coworkers, and reduced service consistency during a high-traffic period.',
    expectation:
      'Arrive and be floor-ready at least 5 minutes before every scheduled shift. If an unavoidable delay happens, notify leadership before start time.',
  },
  sales: {
    summary:
      'The employee missed the weekly sales goal and did not complete the agreed outreach activity needed to recover performance.',
    impact:
      'Missing target reduced store results for the week and limited opportunities to convert active customer conversations into sales.',
    expectation:
      'Complete daily outreach and follow the sales activity plan each shift. Track progress with your lead and escalate blockers early.',
  },
  followup: {
    summary:
      'The employee did not complete required customer follow-ups after initial interactions, leaving open commitments unresolved.',
    impact:
      'Unfinished follow-ups created missed revenue opportunities and weakened customer trust in promised next steps.',
    expectation:
      'Close all assigned follow-ups by end of shift and document outcomes clearly. If extra time is needed, communicate status before handoff.',
  },
}

function getMockPreview(input: string): PreviewResult {
  const normalized = input.toLowerCase()
  if (normalized.includes('late') || normalized.includes('shift')) return PREVIEW_EXAMPLES.late
  if (normalized.includes('sales') || normalized.includes('goal')) return PREVIEW_EXAMPLES.sales
  return PREVIEW_EXAMPLES.followup
}

export default function LandingPage() {
  const [issueText, setIssueText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [demoGenerationCount, setDemoGenerationCount] = useState(() => {
    if (typeof window === 'undefined') return 0
    try {
      const raw = window.localStorage.getItem(DEMO_STORAGE_KEY)
      const n = Number(raw ?? 0)
      if (!Number.isFinite(n)) return 0
      return Math.max(0, Math.min(DEMO_GENERATION_LIMIT, Math.floor(n)))
    } catch {
      return 0
    }
  })

  const demosRemaining = Math.max(0, DEMO_GENERATION_LIMIT - demoGenerationCount)
  const demoLimitReached = demosRemaining <= 0
  const demoStatusCopy =
    demoLimitReached
      ? 'You’ve used your 3 free demo generations.'
      : demoGenerationCount <= 0
      ? 'No credit card required • 3 free demos included'
      : `${demosRemaining} demo generation${demosRemaining === 1 ? '' : 's'} left • Create a free account anytime`

  const generatedCopy = useMemo(() => {
    if (!previewResult) return ''
    return [
      `Situation Summary: ${previewResult.summary}`,
      `Impact Statement: ${previewResult.impact}`,
      `Expectation Moving Forward: ${previewResult.expectation}`,
    ].join('\n\n')
  }, [previewResult])

  async function handleGeneratePreview() {
    const trimmed = issueText.trim()
    if (!trimmed || isGenerating || demoLimitReached) return
    setCopyState('idle')
    setIsGenerating(true)
    setPreviewResult(null)
    await new Promise(resolve => setTimeout(resolve, 1300))
    setPreviewResult(getMockPreview(trimmed))
    setDemoGenerationCount(prev => {
      const next = Math.min(DEMO_GENERATION_LIMIT, prev + 1)
      try {
        window.localStorage.setItem(DEMO_STORAGE_KEY, String(next))
      } catch {
        // ignore storage write failures
      }
      return next
    })
    setIsGenerating(false)
  }

  async function handleCopyPreview() {
    if (!generatedCopy) return
    try {
      await navigator.clipboard.writeText(generatedCopy)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

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
              Try TrackoraAI Free
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <p className="landing-eyebrow">FOR MANAGERS, TEAM LEADS, AND FAST-MOVING WORKPLACES</p>
          <h1 className="landing-hero-title">{LANDING_HERO_HEADLINE}</h1>
          <p className="landing-hero-lead">
            TrackoraAI helps managers generate professional coaching and recognition forms with structured AI-powered wording, editable sections, and workplace-ready documentation in seconds.
          </p>
          <p className="landing-hero-trust-ribbon">Built for workplace coaching and recognition documentation that teams can actually use.</p>

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
                  <label className="landing-hero-demo-label" htmlFor="coaching-demo-input">
                    What happened?
                  </label>
                  <textarea
                    id="coaching-demo-input"
                    className="landing-hero-demo-textarea"
                    placeholder="Example: Employee was late to shift and missed 2 customer follow-ups"
                    value={issueText}
                    onChange={event => setIssueText(event.target.value)}
                  />
                  <div className="landing-hero-chip-row" aria-label="Quick examples">
                    {QUICK_EXAMPLES.map(chip => (
                      <button
                        key={chip}
                        type="button"
                        className="landing-hero-chip"
                        onClick={() => setIssueText(chip)}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="landing-btn landing-btn--primary landing-btn--lg landing-generate-btn"
                    disabled={!issueText.trim() || isGenerating || demoLimitReached}
                    onClick={handleGeneratePreview}
                  >
                    {isGenerating
                      ? 'Generating...'
                      : demoLimitReached
                        ? 'Demo limit reached'
                        : 'Generate Coaching Form'}
                  </button>
                  <p className="landing-hero-trust-line">{demoStatusCopy}</p>
                  {demoLimitReached && (
                    <div className="landing-demo-limit-cta" role="status" aria-live="polite">
                      <p className="landing-demo-limit-title">You&rsquo;ve used your 3 free demo generations.</p>
                      <p className="landing-demo-limit-copy">
                        Create a free account to keep generating professional coaching forms.
                      </p>
                      <div className="landing-demo-limit-actions">
                        <a className="landing-btn landing-btn--primary landing-btn--lg" href="/signup">
                          Create Free Account
                        </a>
                        <a className="landing-btn landing-btn--ghost landing-btn--lg" href="/login">
                          Log In
                        </a>
                      </div>
                    </div>
                  )}
                </div>
                <div
                  className={'landing-hero-demo-output' + (demoLimitReached ? ' is-demo-locked' : '')}
                  aria-live="polite"
                >
                  <div className="landing-preview-header">
                    <p className="landing-hero-demo-label">Professional preview</p>
                    <button
                      type="button"
                      className="landing-btn landing-btn--outline landing-copy-btn"
                      onClick={handleCopyPreview}
                      disabled={!previewResult}
                    >
                      {copyState === 'copied' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  {isGenerating ? (
                    <div className="landing-preview-loading" role="status">
                      <span className="landing-preview-loading-bar" />
                      <span className="landing-preview-loading-bar" />
                      <span className="landing-preview-loading-bar" />
                    </div>
                  ) : previewResult ? (
                    <div className="landing-preview-content">
                      <article className="landing-preview-block">
                        <h3>Situation summary</h3>
                        <p>{previewResult.summary}</p>
                      </article>
                      <article className="landing-preview-block">
                        <h3>Impact statement</h3>
                        <p>{previewResult.impact}</p>
                      </article>
                      <article className="landing-preview-block">
                        <h3>Expectation moving forward</h3>
                        <p>{previewResult.expectation}</p>
                      </article>
                    </div>
                  ) : (
                    <p className="landing-hero-demo-text landing-hero-demo-text--output">
                      Your preview appears here in seconds. Try a quick example or type your own coaching issue.
                    </p>
                  )}
                  <p className="landing-preview-footnote">
                    Structured coaching sections continue below with editable AI refinements, manager follow-ups, and workplace-ready documentation tools.
                  </p>
                </div>
              </div>
            </div>
          </div>

        </section>

        <section className="landing-features" aria-labelledby="landing-features-heading">
          <h2 id="landing-features-heading" className="landing-section-title">
            Why coaching forms feel stressful right now
          </h2>
          <ul className="landing-feature-grid">
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">You lose 15-30 minutes after every shift</h3>
              <p className="landing-feature-copy">Manual write-ups eat your closeout time when you are already tired.</p>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">It is hard to sound clear and professional fast</h3>
              <p className="landing-feature-copy">Second-guessing wording slows you down and adds unnecessary stress.</p>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Inconsistent notes create follow-up risk</h3>
              <p className="landing-feature-copy">Missing structure can lead to unclear expectations and repeat issues.</p>
            </li>
          </ul>
        </section>

        <section className="landing-features landing-features--solutions" aria-labelledby="landing-solutions-heading">
          <h2 id="landing-solutions-heading" className="landing-section-title">
            What you get in seconds
          </h2>
          <ul className="landing-feature-grid">
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Save time every shift</h3>
              <p className="landing-feature-copy">Type a quick note and get a ready-to-use form instantly.</p>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Sound professional every time</h3>
              <p className="landing-feature-copy">Clean structure keeps documentation clear and manager-ready.</p>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Reduce stress and move on faster</h3>
              <p className="landing-feature-copy">No blank-page thinking. No rewrites. Just copy and use.</p>
            </li>
          </ul>
        </section>

        <section className="landing-features landing-features--comparison" aria-labelledby="landing-comparison-heading">
          <h2 id="landing-comparison-heading" className="landing-section-title">
            Before vs after TrackoraAI
          </h2>
          <div className="landing-compare-grid">
            <article className="landing-feature-card landing-compare-card" aria-label="Before TrackoraAI">
              <h3 className="landing-feature-title">Before</h3>
              <ul className="landing-compare-list">
                <li>Spend 20 minutes writing after shift</li>
                <li>Rewrite wording to sound right</li>
                <li>Hope it looks professional enough</li>
              </ul>
            </article>
            <article className="landing-feature-card landing-compare-card landing-compare-card--after" aria-label="After TrackoraAI">
              <h3 className="landing-feature-title">After</h3>
              <ul className="landing-compare-list">
                <li>Type what happened in plain English</li>
                <li>Get a polished coaching form in seconds</li>
                <li>Copy, paste, and move on with your day</li>
              </ul>
            </article>
          </div>
        </section>

        <section className="landing-trial" aria-labelledby="landing-trial-heading">
          <div className="landing-trial-inner">
            <h2 id="landing-trial-heading" className="landing-trial-title">
              Ready to stop writing forms manually?
            </h2>
            <p className="landing-trial-copy">
              Start free, keep your coaching documentation professional, and save time from your very next shift.
            </p>
            <div className="landing-trial-ctas">
              <a className="landing-btn landing-btn--primary landing-btn--lg" href="/signup">
                Generate Professional Coaching Form
              </a>
              <a className="landing-btn landing-btn--ghost landing-btn--lg" href="/signup">
                Create Free Account
              </a>
            </div>
          </div>
        </section>

        <section className="landing-features landing-features--risk" aria-labelledby="landing-risk-heading">
          <h2 id="landing-risk-heading" className="landing-section-title">
            Try first. Sign up when you are ready.
          </h2>
          <ul className="landing-feature-grid">
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">No credit card required</h3>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Takes less than 10 seconds</h3>
            </li>
            <li className="landing-feature-card">
              <h3 className="landing-feature-title">Full editing and saving after signup</h3>
            </li>
          </ul>
        </section>
      </main>

      <footer className="landing-footer">
        <nav className="legal-row landing-footer-legal" aria-label="Legal and contact">
          <a href="/privacy">Privacy Policy</a>
          <span className="legal-row__sep" aria-hidden>
            ·
          </span>
          <a href="/terms">Terms of Service</a>
          <span className="legal-row__sep" aria-hidden>
            ·
          </span>
          <a href="mailto:Bryantlabs.dev@gmail.com">Contact</a>
        </nav>
        <p className="landing-footer-copy">
          © {new Date().getFullYear()} TrackoraAI · BryantLabs.Dev
        </p>
      </footer>
    </div>
  )
}
