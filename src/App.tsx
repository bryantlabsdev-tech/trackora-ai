import { Capacitor } from '@capacitor/core'
import { useLayoutEffect, useState } from 'react'
import { useAuthSession } from './hooks/useAuthSession'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { normalizeAppRoute, useBrowserPath } from './hooks/useBrowserPath'
import CoachingApp from './CoachingApp'
import AccountSettings from './components/AccountSettings'
import AuthScreen from './components/AuthScreen'
import LandingPage from './components/LandingPage'
import AdsLandingPage from './components/AdsLandingPage'
import ResetPasswordScreen from './components/ResetPasswordScreen'
import { ProfileProvider } from './context/ProfileContext'
import './App.css'
import './auth.css'

function SupabaseConfigMissing() {
  return (
    <div className="auth-screen">
      <div className="auth-card card">
        <p className="eyebrow">Trackora</p>
        <h1 className="auth-title">Supabase not configured</h1>
        <p className="auth-subtitle">Add these to your project <code>.env</code> and restart the dev server:</p>
        <p className="auth-config-hint">
          <code>VITE_SUPABASE_URL</code>
          <br />
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
        </p>
        <p className="auth-config-hint" style={{ marginTop: '1rem' }}>
          Use the project URL and anon public key from the Supabase dashboard (Settings → API).
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const { session, loading } = useAuthSession()
  const [view, setView] = useState<'coaching' | 'settings'>('coaching')
  const { pathname, replace } = useBrowserPath()
  const route = normalizeAppRoute(pathname)

  useLayoutEffect(() => {
    if (loading) return

    // Capacitor / packaged app: skip marketing site; open the app shell directly.
    if (Capacitor.isNativePlatform()) {
      let p = pathname.replace(/\/index\.html\/?$/, '')
      if (p === '') p = '/'
      if (p === '/') {
        replace('/app')
        return
      }
    }

    if (session) {
      if (
        route === 'landing' ||
        route === 'ads-landing' ||
        route === 'login' ||
        route === 'signup' ||
        route === 'other'
      ) {
        replace('/app')
      }
    } else if (route === 'app' || route === 'other') {
      replace(route === 'app' ? '/login' : '/')
    }
  }, [loading, session, route, pathname, replace])

  if (!isSupabaseConfigured || !supabase) {
    return <SupabaseConfigMissing />
  }

  const client = supabase

  if (route === 'reset-password') {
    return (
      <ResetPasswordScreen
        client={client}
        onDone={() => replace(session ? '/app' : '/login')}
        onBack={() => replace(session ? '/app' : '/login')}
      />
    )
  }

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="auth-loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden />
          <span>Loading…</span>
        </div>
      </div>
    )
  }

  if (!session) {
    if (route === 'landing') {
      return <LandingPage />
    }
    if (route === 'ads-landing') {
      return <AdsLandingPage />
    }
    if (route === 'login') {
      return <AuthScreen client={client} defaultMode="signin" onBack={() => replace('/')} />
    }
    if (route === 'signup') {
      return <AuthScreen client={client} defaultMode="signup" onBack={() => replace('/')} />
    }
    return (
      <div className="auth-screen">
        <div className="auth-loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden />
          <span>Loading…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="app-with-session">
      <div className="user-bar" role="navigation" aria-label="Account">
        <span className="user-bar-email" title={session.user.email ?? undefined}>
          {session.user.email}
        </span>
        <button
          type="button"
          className="user-bar-link"
          onClick={() => setView((v) => (v === 'settings' ? 'coaching' : 'settings'))}
        >
          {view === 'settings' ? 'Back to Coach' : 'Account Settings'}
        </button>
        <button type="button" className="user-bar-signout" onClick={() => void client.auth.signOut()}>
          Sign out
        </button>
      </div>
      <ProfileProvider client={client} userId={session.user.id} email={session.user.email ?? null}>
        {view === 'settings' ? (
          <AccountSettings
            userId={session.user.id}
            email={session.user.email ?? null}
            onSignOut={async () => {
              await client.auth.signOut()
            }}
          />
        ) : (
          <CoachingApp />
        )}
      </ProfileProvider>
    </div>
  )
}
