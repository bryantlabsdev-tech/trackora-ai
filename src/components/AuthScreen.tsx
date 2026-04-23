import { useEffect, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import appIcon from '../assets/app-icon.png'
import '../auth.css'

type Mode = 'signin' | 'signup'

type Props = {
  client: SupabaseClient
  defaultMode?: Mode
  onBack?: () => void
}

/** Map Supabase messages to short, on-brand copy without changing other errors. */
function formatAuthErrorMessage(raw: string): string {
  const t = raw.trim()
  if (/invalid login credentials/i.test(t)) {
    return 'Invalid email or password.'
  }
  return raw
}

export default function AuthScreen({ client, defaultMode = 'signin', onBack }: Props) {
  const [mode, setMode] = useState<Mode>(defaultMode)

  useEffect(() => {
    setMode(defaultMode)
  }, [defaultMode])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resetSending, setResetSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function handleForgotPassword() {
    setError(null)
    setInfo(null)
    const em = email.trim()
    if (!em) {
      setError('Enter your email address first, then use Forgot password.')
      return
    }
    setResetSending(true)
    try {
      const { error: err } = await client.auth.resetPasswordForEmail(em, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (err) {
        setError(formatAuthErrorMessage(err.message))
        return
      }
      setInfo('If an account exists for that email, we sent a link to reset your password.')
    } finally {
      setResetSending(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    const em = email.trim()
    if (!em && !password) {
      setError('Enter your email and password.')
      return
    }
    if (!em) {
      setError('Enter your email address.')
      return
    }
    if (!password) {
      setError('Enter your password.')
      return
    }
    setLoading(true)
    try {
      if (mode === 'signup') {
        const { error: err } = await client.auth.signUp({ email: em, password })
        if (err) {
          setError(formatAuthErrorMessage(err.message))
          return
        }
        setInfo('Check your email to confirm your account if required by your project settings.')
      } else {
        const { error: err } = await client.auth.signInWithPassword({ email: em, password })
        if (err) {
          setError(formatAuthErrorMessage(err.message))
          return
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const busy = loading || resetSending

  return (
    <div className="auth-screen">
      <div className="auth-card card">
        {onBack && (
          <button type="button" className="auth-back-link" onClick={onBack}>
            ← Back
          </button>
        )}
        <div className="auth-brand">
          <img
            className="auth-app-icon"
            src={appIcon}
            alt=""
            width={40}
            height={40}
            decoding="async"
          />
          <p className="eyebrow">Trackora</p>
        </div>
        <h1 className="auth-title">
          {mode === 'signin' ? 'Sign in' : 'Start writing coaching forms in 10 seconds'}
        </h1>
        <p className="auth-subtitle">
          {mode === 'signin' ? 'Use your email and password to continue.' : 'Free trial. No credit card required.'}
        </p>

        <div className="auth-mode-toggle" role="tablist" aria-label="Account">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            className={'auth-mode-btn' + (mode === 'signin' ? ' is-active' : '')}
            onClick={() => {
              setMode('signin')
              setError(null)
              setInfo(null)
              setResetSending(false)
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={'auth-mode-btn' + (mode === 'signup' ? ' is-active' : '')}
            onClick={() => {
              setMode('signup')
              setError(null)
              setInfo(null)
              setResetSending(false)
            }}
          >
            Sign up
          </button>
        </div>

        <form className="auth-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
          <label className="field" htmlFor="auth-email">
            <span className="label-text">Email</span>
            <input
              id="auth-email"
              className="field-control"
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'auth-form-error' : undefined}
            />
            {mode === 'signup' && <p className="auth-email-helper">No spam. Just your account.</p>}
          </label>
          <label className="field auth-field-password" htmlFor="auth-password">
            <span className="label-text">Password</span>
            <div className="password-field">
              <input
                id="auth-password"
                className="field-control password-field-input"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'auth-form-error' : undefined}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={busy}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {mode === 'signin' && (
              <div className="auth-forgot-row">
                <button
                  type="button"
                  className="auth-forgot-link"
                  onClick={() => void handleForgotPassword()}
                  disabled={busy}
                >
                  {resetSending ? 'Sending...' : 'Forgot password?'}
                </button>
              </div>
            )}
          </label>

          {error && (
            <div id="auth-form-error" className="auth-error-banner" role="alert">
              <p className="auth-error-text">{error}</p>
            </div>
          )}
          {info && (
            <p className="auth-info" role="status">
              {info}
            </p>
          )}

          <button
            type="submit"
            className="btn-primary auth-submit-btn"
            disabled={busy}
            aria-busy={loading}
          >
            {loading ? (
              <>
                <span className="spinner auth-submit-spinner" aria-hidden />
                <span>{mode === 'signin' ? 'Signing in...' : 'Creating account...'}</span>
              </>
            ) : (
              <span>{mode === 'signin' ? 'Sign in' : 'Start Free Trial'}</span>
            )}
          </button>
          {mode === 'signup' && (
            <ul className="auth-trust-list" aria-label="Trial trust points">
              <li>✓ Takes 10 seconds</li>
              <li>✓ Built for real managers</li>
              <li>✓ No more typing after shifts</li>
            </ul>
          )}
        </form>
      </div>
    </div>
  )
}
