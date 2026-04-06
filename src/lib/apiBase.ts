/**
 * Coaching API URL. Web + Vite dev: defaults to `/api/ai` (proxy).
 * Native (Capacitor): set `VITE_API_BASE_URL` to your reachable API origin, e.g. `http://192.168.1.10:3001` (no trailing slash).
 */
export function getCoachingApiUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL
  const base = typeof raw === 'string' ? raw.replace(/\/$/, '') : ''
  if (base) return `${base}/api/ai`
  return '/api/ai'
}
