import { useMemo } from 'react'

/** Query keys preserved from paid/organic campaigns into signup & login. */
const CONVERSION_QUERY_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'msclkid',
] as const

/**
 * Append ad/UTM params from the landing URL onto auth paths.
 * @param {string} path
 * @param {string} [search]
 */
export function buildConversionUrl(path: string, search?: string) {
  if (typeof window === 'undefined') return path
  const incoming = new URLSearchParams(search ?? window.location.search)
  const kept = new URLSearchParams()
  for (const key of CONVERSION_QUERY_KEYS) {
    const value = incoming.get(key)
    if (value) kept.set(key, value)
  }
  const qs = kept.toString()
  return qs ? `${path}?${qs}` : path
}

/**
 * @param {string} [search]
 */
export function getConversionLinks(search?: string) {
  const q = search ?? (typeof window !== 'undefined' ? window.location.search : '')
  return {
    signup: buildConversionUrl('/signup', q),
    login: buildConversionUrl('/login', q),
  }
}

export function useConversionLinks() {
  const search = typeof window !== 'undefined' ? window.location.search : ''
  return useMemo(() => getConversionLinks(search), [search])
}

const AUTH_RETURN_KEY = 'trackora_auth_return'

/**
 * Remember which landing page the visitor came from (keeps ad query string on "back").
 * @param {'/' | '/landing'} path
 */
export function rememberAuthReturnPath(path: '/' | '/landing' = '/') {
  if (typeof window === 'undefined') return
  try {
    const suffix = window.location.search || ''
    sessionStorage.setItem(AUTH_RETURN_KEY, `${path}${suffix}`)
  } catch {
    // ignore
  }
}

export function readAuthReturnPath() {
  if (typeof window === 'undefined') return '/'
  try {
    return sessionStorage.getItem(AUTH_RETURN_KEY) || '/'
  } catch {
    return '/'
  }
}
