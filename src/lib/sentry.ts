/**
 * Optional Sentry for the React app. Set `VITE_SENTRY_DSN` to enable.
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim()
  if (!dsn) return

  void import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn,
      environment: import.meta.env.VITE_SENTRY_ENVIRONMENT?.trim() || import.meta.env.MODE,
      tracesSampleRate: 0.1,
      integrations: [Sentry.browserTracingIntegration()],
    })
  })
}
