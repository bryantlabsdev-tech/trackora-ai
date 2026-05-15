/**
 * Optional Sentry for Express. Set `SENTRY_DSN` in `.env` to enable.
 * @param {import('express').Express} app
 */
export async function setupSentryExpress(app) {
  const dsn = process.env.SENTRY_DSN?.trim()
  if (!dsn) return

  try {
    const Sentry = await import('@sentry/node')
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV || 'development',
      tracesSampleRate: Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1') || 0.1,
    })
    if (typeof Sentry.setupExpressErrorHandler === 'function') {
      Sentry.setupExpressErrorHandler(app)
    }
    console.log('[sentry] Express error handler enabled')
  } catch (e) {
    console.warn('[sentry] Could not initialize:', e?.message)
  }
}

/**
 * @param {unknown} err
 * @param {Record<string, unknown>} [context]
 */
export function captureServerException(err, context) {
  const dsn = process.env.SENTRY_DSN?.trim()
  if (!dsn) return
  void import('@sentry/node')
    .then((Sentry) => {
      Sentry.captureException(err, context ? { extra: context } : undefined)
    })
    .catch(() => {})
}
