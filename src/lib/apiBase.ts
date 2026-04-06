/** Production API origin — no trailing slash. */
const DEFAULT_API_BASE = 'https://trackora-ai.onrender.com'

/**
 * Returns the coaching `POST` URL. Uses `VITE_API_BASE_URL` when set (no trailing slash);
 * otherwise the production host below.
 */
export function getCoachingApiUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  const base =
    trimmed !== '' ? trimmed.replace(/\/$/, '') : DEFAULT_API_BASE
  return `${base}/api/ai`
}
