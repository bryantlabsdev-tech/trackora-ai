import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useProfile } from '../context/ProfileContext'
import { markWhatsNewSeenForCurrentVersion, shouldShowWhatsNewUpdatePopup } from '../lib/updateBannerVersion'

type WhatsNewUpdateModalProps = {
  /** Signed-in user id (session); used to gate mount until auth is established. */
  userId: string
  /** Optional: e.g. open Account Settings after dismiss so users can review plan / legal. */
  onOpenAccountSettings?: () => void
}

/**
 * Lightweight “What’s New” for returning users after login (localStorage only).
 */
export default function WhatsNewUpdateModal({ userId, onOpenAccountSettings }: WhatsNewUpdateModalProps) {
  const { profile, loading } = useProfile()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!userId || loading) {
      setOpen(false)
      return
    }
    setOpen(shouldShowWhatsNewUpdatePopup(profile, loading))
  }, [userId, loading, profile?.id, profile?.has_seen_tutorial, profile?.needs_coaching_workspace_setup])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        markWhatsNewSeenForCurrentVersion()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  function dismiss() {
    markWhatsNewSeenForCurrentVersion()
    setOpen(false)
  }

  function handleBackdropClick() {
    dismiss()
  }

  function handleWhatsNewDetails() {
    dismiss()
    onOpenAccountSettings?.()
  }

  if (!open) return null

  return createPortal(
    <div className="whats-new-overlay" role="presentation" onClick={handleBackdropClick}>
      <div
        className="whats-new-dialog card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="whats-new-title" className="whats-new-title">
          TrackoraAI has been updated
        </h2>
        <p className="whats-new-body">
          We&apos;ve improved coaching generation, workspace support, AI refinements, onboarding, billing, and overall
          performance while you were away.
        </p>
        <ul className="whats-new-list">
          <li>General workplace coaching support</li>
          <li>AI refinement improvements</li>
          <li>New Pro / Elite structure</li>
          <li>Faster and cleaner onboarding</li>
          <li>Privacy + Terms pages</li>
          <li>Better account settings and workflow polish</li>
        </ul>
        <div className="whats-new-actions">
          <button type="button" className="btn-primary whats-new-btn-primary" onClick={dismiss}>
            Continue
          </button>
          <button type="button" className="btn-secondary whats-new-btn-secondary" onClick={handleWhatsNewDetails}>
            What&apos;s New
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
