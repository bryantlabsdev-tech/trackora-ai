import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import AppSplashScreen from './components/AppSplashScreen'
import CheckoutSuccess from './CheckoutSuccess'
import './index.css'
import './splash.css'

function isCheckoutSuccessPath(pathname: string): boolean {
  return pathname === '/success' || pathname.endsWith('/success')
}

function shouldShowMobileSplash(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 639px)').matches
}

function Root() {
  const [splashPhase, setSplashPhase] = useState<'off' | 'visible' | 'exiting'>(() => {
    if (typeof window === 'undefined') return 'off'
    if (isCheckoutSuccessPath(window.location.pathname)) return 'off'
    return shouldShowMobileSplash() ? 'visible' : 'off'
  })

  useEffect(() => {
    if (splashPhase !== 'visible') return
    const tEnter = window.setTimeout(() => setSplashPhase('exiting'), 580)
    return () => window.clearTimeout(tEnter)
  }, [splashPhase])

  useEffect(() => {
    if (splashPhase !== 'exiting') return
    const tRemove = window.setTimeout(() => setSplashPhase('off'), 400)
    return () => window.clearTimeout(tRemove)
  }, [splashPhase])

  if (typeof window !== 'undefined' && isCheckoutSuccessPath(window.location.pathname)) {
    return <CheckoutSuccess />
  }

  return (
    <>
      {splashPhase !== 'off' && (
        <div
          className={'app-splash-overlay' + (splashPhase === 'exiting' ? ' app-splash-overlay--exit' : '')}
          aria-hidden="true"
        >
          <AppSplashScreen />
        </div>
      )}
      <App />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
