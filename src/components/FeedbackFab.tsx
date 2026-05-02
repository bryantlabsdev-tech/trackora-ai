import { useCallback, useEffect, useId, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { usePostTutorialFeedbackNudge } from '../context/PostTutorialFeedbackNudgeContext'

type FeedbackFabProps = {
  client: SupabaseClient
  userId: string
  userEmail: string | null
}

export default function FeedbackFab({ client, userId, userEmail }: FeedbackFabProps) {
  const { feedbackNudgeActive } = usePostTutorialFeedbackNudge()
  const titleId = useId()
  const thanksId = useId()
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<'form' | 'thanks'>('form')
  const [message, setMessage] = useState('')
  const [followUpEmail, setFollowUpEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetForm = useCallback(() => {
    setPhase('form')
    setMessage('')
    setFollowUpEmail('')
    setError(null)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    resetForm()
  }, [resetForm])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  useEffect(() => {
    const onOpenFeedback = (ev: Event) => {
      const detail = (ev as CustomEvent<{ presetMessage?: string }>).detail
      if (typeof detail?.presetMessage === 'string') {
        setMessage(detail.presetMessage)
      } else {
        setMessage('')
      }
      setPhase('form')
      setError(null)
      setOpen(true)
    }
    window.addEventListener('trackora-open-feedback', onOpenFeedback as EventListener)
    return () => window.removeEventListener('trackora-open-feedback', onOpenFeedback as EventListener)
  }, [])

  useEffect(() => {
    if (phase !== 'thanks' || !open) return
    const id = window.setTimeout(() => close(), 1800)
    return () => window.clearTimeout(id)
  }, [phase, open, close])

  const submit = useCallback(async () => {
    const trimmed = message.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    setError(null)
    const followTrim = followUpEmail.trim()
    const { error: insertError } = await client.from('feedback').insert({
      user_id: userId,
      user_email: userEmail?.trim() || null,
      message: trimmed,
      follow_up_email: followTrim.length > 0 ? followTrim : null,
    })
    setSubmitting(false)
    if (insertError) {
      setError(insertError.message || 'Could not send feedback. Try again.')
      return
    }
    setPhase('thanks')
  }, [message, followUpEmail, submitting, client, userId, userEmail])

  return (
    <>
      {feedbackNudgeActive && (
        <div className="feedback-nudge-toast" role="status" aria-live="polite">
          <p className="feedback-nudge-text">
            If anything feels off or confusing, tap the Feedback button at the bottom — we’re actively improving
            this.
          </p>
        </div>
      )}
      <button
        type="button"
        className={'feedback-fab' + (feedbackNudgeActive ? ' is-nudge-pulse' : '')}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Feedback
      </button>

      {open && (
        <div className="feedback-modal-root" role="presentation">
          <button type="button" className="feedback-modal-backdrop" aria-label="Close" onClick={close} />
          <div
            className="feedback-modal feedback-modal--compact card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={phase === 'form' ? titleId : thanksId}
          >
            {phase === 'form' ? (
              <>
                <h2 id={titleId} className="feedback-modal-title">
                  Help improve TrackoraAI
                </h2>
                <label className="feedback-field">
                  <span className="feedback-label">What was confusing, missing, or not working?</span>
                  <textarea
                    className="feedback-textarea"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    autoComplete="off"
                  />
                </label>
                <label className="feedback-field">
                  <span className="feedback-label">Email if you want us to follow up</span>
                  <input
                    type="email"
                    className="feedback-input"
                    value={followUpEmail}
                    onChange={(e) => setFollowUpEmail(e.target.value)}
                    placeholder="Optional"
                    autoComplete="email"
                  />
                </label>
                {error && (
                  <p className="feedback-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="feedback-actions feedback-actions--single">
                  <button type="button" className="feedback-btn-secondary" onClick={close}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="feedback-btn-primary btn-primary"
                    disabled={!message.trim() || submitting}
                    onClick={() => void submit()}
                  >
                    {submitting && <span className="spinner" aria-hidden />}
                    {submitting ? 'Sending…' : 'Send feedback'}
                  </button>
                </div>
              </>
            ) : (
              <p id={thanksId} className="feedback-success" role="status">
                Thanks — your feedback helps improve TrackoraAI.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
