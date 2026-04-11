/**
 * First-load splash: dark gradient, wordmark, and entrance animation (see splash.css).
 * Shown only on narrow viewports from main.tsx; not used on /success.
 */
export default function AppSplashScreen() {
  return (
    <div className="app-splash-screen" aria-hidden="true">
      <div className="app-splash-screen-inner">
        <p className="app-splash-screen-logo">TrackoraAI</p>
        <p className="app-splash-screen-tag">AI Coaching</p>
      </div>
    </div>
  )
}
