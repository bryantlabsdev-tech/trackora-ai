import { useEffect, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import appIcon from '../assets/app-icon.png'
import '../auth.css'

type ResetPasswordScreenProps = {
  client: SupabaseClient
  onDone: () => void
  onBack: () => void
}

const MIN_PASSWORD_LENGTH = 8

export default function ResetPasswordScreen({ client, onDone, onBack }: ResetPasswordScreenProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasRecoverySession, setHasRecoverySession] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    client.auth.getSession().then(({ data }) => {
      if (!mounted) return
      if (data.session) setHasRecoverySession(true)
    })

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY' || session) {
        setHasRecoverySession(true)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [client])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)

    if (!hasRecoverySession) {
      setError('Open the reset link from your email to continue.')
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const { error: updateError } = await client.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        return
      }
      setInfo('Password updated successfully. Redirecting to your account...')
      window.setTimeout(onDone, 1200)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card card">
        <button type="button" className="auth-back-link" onClick={onBack}>
          ← Back
        </button>
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
        <h1 className="auth-title">Set a new password</h1>
        <p className="auth-subtitle">
          {hasRecoverySession
            ? 'Enter your new password below.'
            : 'Open the reset link from your email to securely continue.'}
        </p>

        <form className="auth-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
          <label className="field" htmlFor="new-password">
            <span className="label-text">New password</span>
            <div className="password-field">
              <input
                id="new-password"
                className="field-control password-field-input"
                type={showPassword ? 'text' : 'password'}
                name="new-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={loading}
                aria-label={showPassword ? 'Hide new password' : 'Show new password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          <label className="field" htmlFor="confirm-password">
            <span className="label-text">Confirm new password</span>
            <div className="password-field">
              <input
                id="confirm-password"
                className="field-control password-field-input"
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirm-password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                disabled={loading}
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              >
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          {error && (
            <div className="auth-error-banner" role="alert">
              <p className="auth-error-text">{error}</p>
            </div>
          )}
          {info && (
            <p className="auth-info" role="status">
              {info}
            </p>
          )}

          <button type="submit" className="btn-primary auth-submit-btn" disabled={loading || !hasRecoverySession}>
            {loading ? 'Updating password...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
