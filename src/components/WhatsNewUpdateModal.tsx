import { useEffect, useMemo, useState } from 'react'
import { useProfile } from '../context/ProfileContext'
import { getWhatsNewDismissStorageKey } from '../lib/updateBannerVersion'

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(getWhatsNewDismissStorageKey()) === '1'
  } catch {
    return false
  }
}

function persistDismissed() {
  try {
    window.localStorage.setItem(getWhatsNewDismissStorageKey(), '1')
  } catch {
    // ignore
  }
}

type WhatsNewUpdateModalProps = {
  /** Optional: e.g. open Account Settings after dismiss so users can review plan / legal. */
  onOpenAccountSettings?: () => void
}

/**
 * Lightweight “What’s New” for returning users after login (localStorage only).
 */
export default function WhatsNewUpdateModal({ onOpenAccountSettings }: WhatsNewUpdateModalProps) {
  const { profile, loading, error } = useProfile()
  const [open, setOpen] = useState(false)

  const eligible = useMemo(() => {
    if (loading || !profile || error) return false
    if (!profile.has_seen_tutorial) return false
    if (profile.needs_coaching_workspace_setup) return false
    return true
  }, [loading, profile, error])

  useEffect(() => {
    if (!eligible) {
      setOpen(false)
      return
    }
    if (readDismissed()) {
      setOpen(false)
      return
    }
    setOpen(true)
  }, [eligible])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        persistDismissed()
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
    persistDismissed()
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

  return (
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
    </div>
  )
}
