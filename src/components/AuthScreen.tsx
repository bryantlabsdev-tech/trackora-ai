import { useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import '../auth.css'

type Mode = 'signin' | 'signup'

type Props = {
  client: SupabaseClient
}

export default function AuthScreen({ client }: Props) {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    const em = email.trim()
    if (!em || !password) {
      setError('Enter email and password.')
      return
    }
    setLoading(true)
    try {
      if (mode === 'signup') {
        const { error: err } = await client.auth.signUp({ email: em, password })
        if (err) {
          setError(err.message)
          return
        }
        setInfo('Check your email to confirm your account if required by your project settings.')
      } else {
        const { error: err } = await client.auth.signInWithPassword({ email: em, password })
        if (err) {
          setError(err.message)
          return
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card card">
        <p className="eyebrow">Trackora</p>
        <h1 className="auth-title">{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
        <p className="auth-subtitle">Use your email and password to continue.</p>

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
            }}
          >
            Sign up
          </button>
        </div>

        <form className="auth-form" onSubmit={(e) => void handleSubmit(e)}>
          <label className="field">
            <span className="label-text">Email</span>
            <input
              className="field-control"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </label>
          <label className="field">
            <span className="label-text">Password</span>
            <input
              className="field-control"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </label>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          {info && (
            <p className="auth-info" role="status">
              {info}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading && <span className="spinner" aria-hidden />}
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        </form>
      </div>
    </div>
  )
}
