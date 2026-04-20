import { useCallback, useEffect, useState } from 'react'

/** Current `location.pathname` + `replaceState` helper; listens for `popstate`. */
export function useBrowserPath() {
  const [pathname, setPathname] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  )

  const replace = useCallback((to: string) => {
    window.history.replaceState(null, '', to)
    setPathname(window.location.pathname)
  }, [])

  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return { pathname, replace }
}

export type AppRoute = 'landing' | 'login' | 'signup' | 'app' | 'other'

export function normalizeAppRoute(pathname: string): AppRoute {
  let p = pathname.replace(/\/index\.html\/?$/, '')
  if (p === '') p = '/'
  if (p === '/app' || p.startsWith('/app/')) return 'app'
  if (p === '/') return 'landing'
  if (p === '/login') return 'login'
  if (p === '/signup') return 'signup'
  return 'other'
}
