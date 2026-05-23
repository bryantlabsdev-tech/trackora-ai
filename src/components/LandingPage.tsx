import appIcon from '../assets/app-icon.png'
import '../landing.css'
import { rememberAuthReturnPath, useConversionLinks } from '../lib/adConversionLinks'
import {
  trackDemoCompleted,
  trackDemoCopied,
  trackDemoLimitReached,
  trackDemoStarted,
  trackLandingPageView,
  trackSignupClick,
  trackTryDemoClick,
  type DemoSource,
  type LandingVariant,
  type SignupPlacement,
} from '../lib/landingAnalytics'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

export type LandingPageVariant = 'default' | 'ads'

type LandingPageProps = {
  /** `ads` — Google/paid traffic at `/landing` (tighter message match, UTM passthrough). */
  variant?: LandingPageVariant
}

const ADS_PAGE_TITLE = 'TrackoraAI — Coaching Forms in Seconds'
const ADS_PAGE_DESCRIPTION =
  'Generate professional coaching forms in seconds. Mobile sales floor or general workplace—pick your mode. Start free.'

export const LANDING_HERO_HEADLINE = 'Professional Coaching Forms Generated in Seconds'

const DEMO_STORAGE_KEY = 'trackoraai_demo_generation_count'
const DEMO_GENERATION_LIMIT = 3
const DEMO_GENERATION_MS = 1300

type PreviewResult = {
  situation: string
  behavior: string
  impact: string
  nextSteps: string[]
}

const QUICK_EXAMPLES = ['Late to shift', 'Missed sales goal', 'Missed deadline', 'Poor follow-up'] as const

const WORKSPACE_MODES = [
  {
    icon: '📱',
    title: 'Mobile Sales Coaching',
    description: 'Wireless retail, metrics, and floor-ready sales coaching.',
  },
  {
    icon: '🧑‍💼',
    title: 'General Workplace Coaching',
    description: 'Offices, service, operations, warehouses, and more.',
  },
] as const

const SOCIAL_PROOF = [
  {
    quote: 'Finally sounds like something I\u2019d actually say on the floor\u2014not generic HR language.',
    role: 'Retail team lead',
  },
  {
    quote: 'Our supervisors use it for attendance and conduct write-ups\u2014reads professional, not robotic.',
    role: 'Operations manager',
  },
  {
    quote: 'The Situation / Behavior / Impact structure is exactly what we use\u2014already formatted.',
    role: 'Team supervisor',
  },
] as const

type SignupLinkProps = {
  href: string
  placement: SignupPlacement
  variant: LandingVariant
  className?: string
  children: ReactNode
}

function SignupLink({ href, placement, variant, className, children }: SignupLinkProps) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => trackSignupClick(placement, variant)}
    >
      {children}
    </a>
  )
}

const PREVIEW_EXAMPLES: Record<string, PreviewResult> = {
  late: {
    situation:
      'Alex arrived late to the scheduled shift and was not floor-ready when coverage was needed at open.',
    behavior:
      'We need consistent arrival timing and a quick handoff to the team so the floor is not short-staffed during peak traffic.',
    impact:
      'Late coverage creates pressure on the rest of the team and weakens customer engagement during the busiest part of the day.',
    nextSteps: [
      'Arrive and be floor-ready 5 minutes before every scheduled shift',
      'Notify leadership before start time if a delay is unavoidable',
      'Confirm opening priorities with the lead at the start of each shift',
      'Track attendance consistency for the next two weeks',
      'Check in with your lead after the next three shifts',
    ],
  },
  sales: {
    situation:
      'Weekly sales target was missed and the agreed recovery activity plan was not completed.',
    behavior:
      'We need stronger daily execution on outreach, customer engagement, and closing the activity plan you committed to.',
    impact:
      'Missing target reduces store results and limits conversion from active customer conversations.',
    nextSteps: [
      'Complete daily outreach targets before end of each shift',
      'Review the sales activity plan with your lead at shift start',
      'Document progress and blockers before handoff',
      'Prioritize high-traffic windows for customer engagement',
      'Recheck results mid-week with your lead',
    ],
  },
  followup: {
    situation:
      'Required customer follow-ups were not completed after initial interactions.',
    behavior:
      'We need every open commitment closed out clearly before you move to the next customer.',
    impact:
      'Unfinished follow-ups create missed revenue and weaken trust in promised next steps.',
    nextSteps: [
      'Close all assigned follow-ups by end of shift',
      'Document outcomes in the handoff notes',
      'Flag blockers to your lead before leaving the floor',
      'Set reminders for callbacks during slower traffic',
      'Review open follow-ups at the start of the next shift',
    ],
  },
  deadline: {
    situation:
      'Jordan missed the agreed project deadline without prior notice or an updated recovery plan.',
    behavior:
      'We need clear communication before deadlines slip and proactive updates when timelines are at risk.',
    impact:
      'Late delivery delays the team, creates rework, and reduces trust in commitments to stakeholders.',
    nextSteps: [
      'Confirm daily priorities and due dates at the start of each shift or workday',
      'Flag blockers to your supervisor before a deadline is at risk',
      'Provide a written recovery plan within 24 hours of any slip',
      'Check in mid-week on open tasks until back on track',
      'Document completed work and handoffs in the team channel',
    ],
  },
}

function getMockPreview(input: string): PreviewResult {
  const normalized = input.toLowerCase()
  if (normalized.includes('late') || normalized.includes('shift')) return PREVIEW_EXAMPLES.late
  if (normalized.includes('sales') || normalized.includes('goal')) return PREVIEW_EXAMPLES.sales
  if (normalized.includes('deadline') || normalized.includes('project')) return PREVIEW_EXAMPLES.deadline
  return PREVIEW_EXAMPLES.followup
}

function scrollToDemo() {
  document.getElementById('coaching-demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function scrollToPreviewOutput() {
  document.getElementById('coaching-demo-output')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

export default function LandingPage({ variant = 'default' }: LandingPageProps) {
  const isAds = variant === 'ads'
  const landingVariant: LandingVariant = isAds ? 'ads' : 'default'
  const { signup: signupUrl, login: loginUrl } = useConversionLinks()
  const brandHref = isAds ? '/landing' : '/'

  useEffect(() => {
    rememberAuthReturnPath(isAds ? '/landing' : '/')
  }, [isAds])

  useEffect(() => {
    trackLandingPageView(landingVariant)
  }, [landingVariant])

  useEffect(() => {
    if (!isAds) return
    const prevTitle = document.title
    document.title = ADS_PAGE_TITLE

    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null
    let createdMeta = false
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'description')
      document.head.appendChild(meta)
      createdMeta = true
    }
    const prevDescription = meta.getAttribute('content')
    meta.setAttribute('content', ADS_PAGE_DESCRIPTION)

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
  }, [isAds])

  const [issueText, setIssueText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
  const [generationSeconds, setGenerationSeconds] = useState<number | null>(null)
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

  useEffect(() => {
    if (!isAds) return
    try {
      if (sessionStorage.getItem('trackora_ads_demo_primed')) return
      sessionStorage.setItem('trackora_ads_demo_primed', '1')
    } catch {
      // ignore
    }
    setIssueText(QUICK_EXAMPLES[0])
  }, [isAds])

  useEffect(() => {
    if (!demoLimitReached) return
    try {
      if (sessionStorage.getItem('trackora_demo_limit_tracked')) return
      sessionStorage.setItem('trackora_demo_limit_tracked', '1')
    } catch {
      // ignore
    }
    trackDemoLimitReached(landingVariant)
  }, [demoLimitReached, landingVariant])

  function handleTryDemo() {
    trackTryDemoClick(landingVariant)
    scrollToDemo()
  }

  function demoSourceForInput(text: string): DemoSource {
    if ((QUICK_EXAMPLES as readonly string[]).includes(text)) return 'chip'
    return 'typed'
  }

  const generatedCopy = useMemo(() => {
    if (!previewResult) return ''
    return [
      'Coaching Category:\nPerformance — coaching documentation',
      '',
      `Situation:\n${previewResult.situation}`,
      '',
      `Behavior:\n${previewResult.behavior}`,
      '',
      `Impact:\n${previewResult.impact}`,
      '',
      'Next Steps:',
      ...previewResult.nextSteps.map(step => `• ${step}`),
      '',
      'Manager Follow-Up:\nCheck back in 3–5 days to confirm progress and adjust focus if needed.',
    ].join('\n')
  }, [previewResult])

  async function handleGeneratePreview() {
    const trimmed = issueText.trim()
    if (!trimmed || isGenerating || demoLimitReached) return
    trackDemoStarted(landingVariant, demoSourceForInput(trimmed))
    setCopyState('idle')
    setIsGenerating(true)
    setPreviewResult(null)
    setGenerationSeconds(null)
    const started = performance.now()
    await new Promise(resolve => setTimeout(resolve, DEMO_GENERATION_MS))
    setPreviewResult(getMockPreview(trimmed))
    const elapsedSec = (performance.now() - started) / 1000
    const roundedSec = Math.round(elapsedSec * 10) / 10
    setGenerationSeconds(roundedSec)
    setDemoGenerationCount(prev => {
      const next = Math.min(DEMO_GENERATION_LIMIT, prev + 1)
      trackDemoCompleted(landingVariant, next, roundedSec)
      try {
        window.localStorage.setItem(DEMO_STORAGE_KEY, String(next))
      } catch {
        // ignore
      }
      return next
    })
    setIsGenerating(false)
    requestAnimationFrame(() => scrollToPreviewOutput())
  }

  useEffect(() => {
    if (!isAds || previewResult) return
    const timer = window.setTimeout(() => {
      document.getElementById('coaching-demo-input')?.focus({ preventScroll: true })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [isAds, previewResult])

  async function handleCopyPreview() {
    if (!generatedCopy) return
    try {
      await navigator.clipboard.writeText(generatedCopy)
      setCopyState('copied')
      trackDemoCopied(landingVariant)
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <div className={'landing-page' + (isAds ? ' landing-page--ads' : '')}>
      <header className="landing-header">
        <div className="landing-header-inner">
          <a className="landing-brand" href={brandHref}>
            <img src={appIcon} alt="" width={36} height={36} className="landing-brand-icon" />
            <span className="landing-brand-text">TrackoraAI</span>
          </a>
          <nav className="landing-header-nav" aria-label="Account">
            <SignupLink
              href={signupUrl}
              placement="header"
              variant={landingVariant}
              className="landing-btn landing-btn--primary"
            >
              Start Free
            </SignupLink>
          </nav>
        </div>
      </header>

      <main>
        {/* 1. Hero + 2. Immediate CTA (above the fold) */}
        <section className="landing-hero landing-hero-shell landing-reveal">
          <p className="landing-eyebrow">
            For retail leaders, supervisors &amp; team leads — sales floor or general workplace
          </p>
          <h1 className="landing-hero-title">
            <span className="landing-hero-accent">Professional Coaching Forms</span>
            <span className="landing-hero-title-rest"> Generated in Seconds</span>
          </h1>
          <p className="landing-hero-lead">
            Generate realistic coaching forms, recognition write-ups, and feedback in seconds. Choose{' '}
            <strong>Mobile Sales</strong> or <strong>General Workplace</strong> mode when you sign up—Trackora adapts
            tone, topics, and examples to your team.
          </p>

          <div className="landing-hero-ctas">
            <button type="button" className="landing-btn landing-btn--primary landing-btn--lg" onClick={handleTryDemo}>
              Try Free Demo
            </button>
            <SignupLink
              href={signupUrl}
              placement="hero_secondary"
              variant={landingVariant}
              className="landing-btn landing-btn--ghost landing-btn--lg"
            >
              Start Free
            </SignupLink>
          </div>
          <p className="landing-hero-friction">
            No credit card · 3 free demos · sign up in under a minute
          </p>

          <ul className="landing-trust-row" aria-label="Trust indicators">
            <li>Live demo below</li>
            <li>Retail + workplace modes</li>
            <li>Full coaching forms</li>
            <li>Copy in one click</li>
          </ul>

          <div className="landing-workspaces" aria-label="Coaching workspaces">
            <p className="landing-workspaces-kicker">Two modes — one app</p>
            <ul className="landing-workspaces-grid">
              {WORKSPACE_MODES.map(mode => (
                <li key={mode.title} className="landing-workspace-card">
                  <span className="landing-workspace-icon" aria-hidden>
                    {mode.icon}
                  </span>
                  <h3 className="landing-workspace-title">{mode.title}</h3>
                  <p className="landing-workspace-desc">{mode.description}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="landing-social-proof" aria-label="What leaders say">
            <ul className="landing-social-proof-grid">
              {SOCIAL_PROOF.map(item => (
                <li key={item.role} className="landing-social-proof-card">
                  <blockquote className="landing-social-proof-quote">&ldquo;{item.quote}&rdquo;</blockquote>
                  <p className="landing-social-proof-role">{item.role}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 3. Product preview — visible early */}
        <section
          id="coaching-demo"
          className="landing-product landing-reveal landing-reveal--delay-1"
          aria-label="Live coaching form demo"
        >
          <div className="landing-product-header">
            <h2 className="landing-product-title">{isAds ? 'Try it now' : 'See it work — right now'}</h2>
            <p className="landing-product-lead">
              Pick a retail or workplace example—or type a quick note. Your form appears in seconds.
            </p>
          </div>

          <div className="landing-hero-demo">
            <div className="landing-hero-demo-window">
              <div className="landing-hero-demo-header">
                <span className="landing-hero-demo-dot" />
                <span className="landing-hero-demo-dot" />
                <span className="landing-hero-demo-dot" />
                <span className="landing-hero-demo-title">TrackoraAI · Coaching generator</span>
                {generationSeconds != null && previewResult && (
                  <span className="landing-generated-badge">Generated in {generationSeconds}s</span>
                )}
              </div>
              <div className="landing-hero-demo-body">
                <div className="landing-hero-demo-input">
                  <label className="landing-hero-demo-label" htmlFor="coaching-demo-input">
                    What happened?
                  </label>
                  <textarea
                    id="coaching-demo-input"
                    className="landing-hero-demo-textarea"
                    placeholder="Example: Late to shift, missed deadline, or missed customer follow-ups"
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
                      ? 'Generating…'
                      : demoLimitReached
                        ? 'Demo limit reached'
                        : 'Generate Coaching Form'}
                  </button>
                  <p className="landing-hero-trust-line">
                    {demoLimitReached
                      ? 'You’ve used your 3 free demo generations.'
                      : demoGenerationCount <= 0
                        ? 'No credit card · 3 free demos on this page'
                        : `${demosRemaining} demo${demosRemaining === 1 ? '' : 's'} left · Create a free account to keep going`}
                  </p>
                  {demoLimitReached && (
                    <div className="landing-demo-limit-cta" role="status" aria-live="polite">
                      <SignupLink
                        href={signupUrl}
                        placement="demo_limit"
                        variant={landingVariant}
                        className="landing-btn landing-btn--primary landing-btn--lg"
                      >
                        Start Free — keep generating
                      </SignupLink>
                    </div>
                  )}
                </div>
                <div
                  id="coaching-demo-output"
                  className={'landing-hero-demo-output' + (demoLimitReached ? ' is-demo-locked' : '')}
                  aria-live="polite"
                >
                  <div className="landing-preview-header">
                    <p className="landing-hero-demo-label">Coaching form output</p>
                    <button
                      type="button"
                      className="landing-btn landing-btn--outline landing-copy-btn"
                      onClick={handleCopyPreview}
                      disabled={!previewResult}
                    >
                      {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy entire form'}
                    </button>
                  </div>
                  {isGenerating ? (
                    <div className="landing-preview-loading" role="status" aria-label="Generating">
                      <span className="landing-preview-loading-bar" />
                      <span className="landing-preview-loading-bar" />
                      <span className="landing-preview-loading-bar" />
                      <p className="landing-preview-loading-text">Building your coaching form…</p>
                    </div>
                  ) : previewResult ? (
                    <div className="landing-preview-content landing-preview-content--full">
                      <article className="landing-preview-block">
                        <h3>Situation</h3>
                        <p>{previewResult.situation}</p>
                      </article>
                      <article className="landing-preview-block">
                        <h3>Behavior</h3>
                        <p>{previewResult.behavior}</p>
                      </article>
                      <article className="landing-preview-block">
                        <h3>Impact</h3>
                        <p>{previewResult.impact}</p>
                      </article>
                      <article className="landing-preview-block">
                        <h3>Next Steps</h3>
                        <ul className="landing-preview-steps">
                          {previewResult.nextSteps.map(step => (
                            <li key={step}>{step}</li>
                          ))}
                        </ul>
                      </article>
                    </div>
                  ) : (
                    <div className="landing-preview-placeholder">
                      <p className="landing-hero-demo-text landing-hero-demo-text--output">
                        Your full coaching form appears here in seconds — Situation, Behavior, Impact, Next Steps, and more.
                      </p>
                      <div className="landing-preview-ghost" aria-hidden>
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {previewResult && !demoLimitReached && (
            <div className="landing-post-demo-cta" role="region" aria-label="Create account">
              <p className="landing-post-demo-cta-copy">
                <strong>Like this form?</strong> Create a free account, pick Mobile Sales or General Workplace mode, and
                generate unlimited coaching forms.
              </p>
              <SignupLink
                href={signupUrl}
                placement="post_demo"
                variant={landingVariant}
                className="landing-btn landing-btn--primary landing-btn--lg"
              >
                Start Free — keep generating
              </SignupLink>
              {copyState === 'copied' && (
                <p className="landing-post-demo-cta-hint">Form copied — save unlimited versions with a free account.</p>
              )}
            </div>
          )}
        </section>

        {/* 4. Value cards */}
        <section className="landing-value landing-reveal landing-reveal--delay-2" aria-labelledby="landing-value-heading">
          <h2 id="landing-value-heading" className="visually-hidden">
            Why leaders use TrackoraAI
          </h2>
          <ul className="landing-value-grid">
            <li className="landing-value-card">
              <span className="landing-value-icon" aria-hidden>
                ⚡
              </span>
              <h3 className="landing-value-title">Saves Hours</h3>
              <p className="landing-value-copy">Generate professional coaching forms in seconds — not after every shift.</p>
            </li>
            <li className="landing-value-card">
              <span className="landing-value-icon" aria-hidden>
                📈
              </span>
              <h3 className="landing-value-title">Improve Accountability</h3>
              <p className="landing-value-copy">Keep coaching consistent, clear, and documented across your team.</p>
            </li>
            <li className="landing-value-card">
              <span className="landing-value-icon" aria-hidden>
                🧠
              </span>
              <h3 className="landing-value-title">Retail &amp; Workplace</h3>
              <p className="landing-value-copy">
                Mobile sales floor coaching or general workplace feedback—realistic wording for both.
              </p>
            </li>
          </ul>
        </section>

        {/* 5. How it works (organic only — ads visitors already tried the demo) */}
        {!isAds && (
        <section className="landing-how landing-reveal landing-reveal--delay-2" aria-labelledby="landing-how-heading">
          <h2 id="landing-how-heading" className="landing-section-title">
            How it works
          </h2>
          <ol className="landing-how-steps">
            <li>
              <span className="landing-how-num">1</span>
              <div>
                <h3>Describe what happened</h3>
                <p>A quick note — lateness, performance, recognition, or conduct.</p>
              </div>
            </li>
            <li>
              <span className="landing-how-num">2</span>
              <div>
                <h3>Get a complete form</h3>
                <p>Structured sections ready to copy, edit, and refine.</p>
              </div>
            </li>
            <li>
              <span className="landing-how-num">3</span>
              <div>
                <h3>Lead faster</h3>
                <p>Less paperwork. More consistency. Move on with your day.</p>
              </div>
            </li>
          </ol>
        </section>
        )}

        {/* 6. Coaching examples */}
        {!isAds && (
        <section className="landing-examples landing-reveal landing-reveal--delay-3" aria-labelledby="landing-examples-heading">
          <h2 id="landing-examples-heading" className="landing-section-title">
            Coaching that sounds like you wrote it
          </h2>
          <ul className="landing-examples-grid">
            <li className="landing-example-card">
              <p className="landing-example-tag">Performance</p>
              <p className="landing-example-quote">
                &ldquo;We need stronger daily execution on outreach and customer engagement during peak traffic.&rdquo;
              </p>
            </li>
            <li className="landing-example-card">
              <p className="landing-example-tag">Attendance</p>
              <p className="landing-example-quote">
                &ldquo;Arrive floor-ready before every shift. Notify leadership before start time if you&rsquo;re delayed.&rdquo;
              </p>
            </li>
            <li className="landing-example-card">
              <p className="landing-example-tag">Recognition</p>
              <p className="landing-example-quote">
                &ldquo;Strong customer engagement and consistent follow-through — keep that momentum on the floor.&rdquo;
              </p>
            </li>
            <li className="landing-example-card">
              <p className="landing-example-tag">Workplace</p>
              <p className="landing-example-quote">
                &ldquo;Flag blockers before a deadline slips and provide a written recovery plan within 24 hours.&rdquo;
              </p>
            </li>
          </ul>
        </section>
        )}

        {/* 7. Final CTA */}
        <section className="landing-trial landing-reveal landing-reveal--delay-3" aria-labelledby="landing-trial-heading">
          <div className="landing-trial-inner">
            <h2 id="landing-trial-heading" className="landing-trial-title">
              {isAds ? 'Ready to use this on every shift?' : 'Stop losing time on coaching paperwork'}
            </h2>
            <p className="landing-trial-copy">
              {isAds
                ? 'Free account. Unlimited forms. Mobile Sales or General Workplace—coaching done fast.'
                : 'Join leaders on the sales floor and in the workplace. Start free — pick your coaching mode at signup.'}
            </p>
            <div className="landing-trial-ctas">
              <SignupLink
                href={signupUrl}
                placement="final"
                variant={landingVariant}
                className="landing-btn landing-btn--primary landing-btn--lg"
              >
                Start Free
              </SignupLink>
              {!isAds && (
                <a className="landing-btn landing-btn--ghost landing-btn--lg" href={loginUrl}>
                  Log In
                </a>
              )}
            </div>
          </div>
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

      <div className="landing-sticky-cta" aria-hidden={false}>
        {previewResult ? (
          <SignupLink
            href={signupUrl}
            placement="sticky"
            variant={landingVariant}
            className="landing-btn landing-btn--primary landing-btn--lg landing-sticky-cta-btn"
          >
            Start Free — unlimited forms
          </SignupLink>
        ) : (
          <button
            type="button"
            className="landing-btn landing-btn--primary landing-btn--lg landing-sticky-cta-btn"
            onClick={handleTryDemo}
          >
            Try Free Demo
          </button>
        )}
      </div>
    </div>
  )
}
