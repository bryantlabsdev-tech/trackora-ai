import { useAuthSession } from './hooks/useAuthSession'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import CoachingApp from './CoachingApp'
import AuthScreen from './components/AuthScreen'
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

  if (!isSupabaseConfigured || !supabase) {
    return <SupabaseConfigMissing />
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
    return <AuthScreen client={supabase} />
  }

  return (
    <div className="app-with-session">
      <div className="user-bar" role="navigation" aria-label="Account">
        <span className="user-bar-email" title={session.user.email ?? undefined}>
          {session.user.email}
        </span>
        <button type="button" className="user-bar-signout" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
      <ProfileProvider client={supabase} userId={session.user.id} email={session.user.email ?? null}>
        <CoachingApp />
      </ProfileProvider>
    </div>
  )
}
