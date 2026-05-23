/** Funnel events for landing + auth — sent to gtag (Google Ads / GA4). */

export type LandingVariant = 'default' | 'ads'

export type SignupPlacement =
  | 'header'
  | 'hero'
  | 'hero_secondary'
  | 'post_demo'
  | 'demo_limit'
  | 'sticky'
  | 'final'

export type DemoSource = 'chip' | 'typed' | 'prefill'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

const SIGNUP_PENDING_KEY = 'trackora_signup_pending'

export function markSignupPending() {
  try {
    sessionStorage.setItem(SIGNUP_PENDING_KEY, '1')
  } catch {
    // ignore
  }
}

export function consumeSignupPending() {
  try {
    const v = sessionStorage.getItem(SIGNUP_PENDING_KEY)
    sessionStorage.removeItem(SIGNUP_PENDING_KEY)
    return v === '1'
  } catch {
    return false
  }
}

function track(eventName: string, params?: Record<string, string | number | boolean | undefined>) {
  if (typeof window === 'undefined') return
  try {
    window.gtag?.('event', eventName, {
      ...params,
      page_path: window.location.pathname,
    })
  } catch {
    // ignore
  }
}

export function trackLandingPageView(variant: LandingVariant) {
  track('landing_page_view', {
    landing_variant: variant,
    is_paid_landing: variant === 'ads',
  })
}

export function trackTryDemoClick(variant: LandingVariant) {
  track('try_demo_click', { landing_variant: variant })
}

export function trackDemoStarted(variant: LandingVariant, source: DemoSource) {
  track('demo_started', { landing_variant: variant, demo_source: source })
}

export function trackDemoCompleted(variant: LandingVariant, demoCount: number, seconds: number) {
  track('demo_completed', {
    landing_variant: variant,
    demo_count: demoCount,
    generation_seconds: seconds,
  })
  track('generate_lead', { landing_variant: variant })
}

export function trackDemoCopied(variant: LandingVariant) {
  track('demo_copied', { landing_variant: variant })
}

export function trackDemoLimitReached(variant: LandingVariant) {
  track('demo_limit_reached', { landing_variant: variant })
}

export function trackSignupClick(placement: SignupPlacement, variant: LandingVariant) {
  track('signup_click', { cta_placement: placement, landing_variant: variant })
}

export function trackSignUpSuccess(method = 'email') {
  track('sign_up', { method })
  const sendTo = import.meta.env.VITE_GOOGLE_ADS_SIGNUP_SEND_TO as string | undefined
  if (sendTo?.includes('/')) {
    window.gtag?.('event', 'conversion', { send_to: sendTo })
  }
}

export function trackLoginSuccess(method = 'email') {
  track('login', { method })
}

export function trackSignupCompletedFromSession() {
  track('signup_completed', { source: 'session' })
}
