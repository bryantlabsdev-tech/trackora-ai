import type { Profile } from '../types/profile'

/**
 * Bump `CURRENT_UPDATE_BANNER_VERSION` to show the “What’s New” modal again for returning users.
 * Dismissal is stored in localStorage per version (see `getWhatsNewDismissStorageKey`).
 *
 * Dev: reset dismissal for the current release:
 * `localStorage.removeItem('trackoraai_seen_update_v1')`
 */
export const CURRENT_UPDATE_BANNER_VERSION = 'v1'

export function getWhatsNewDismissStorageKey(): string {
  return `trackoraai_seen_update_${CURRENT_UPDATE_BANNER_VERSION}`
}

export function hasSeenWhatsNewForCurrentVersion(): boolean {
  try {
    return window.localStorage.getItem(getWhatsNewDismissStorageKey()) === '1'
  } catch {
    return false
  }
}

export function markWhatsNewSeenForCurrentVersion(): void {
  try {
    window.localStorage.setItem(getWhatsNewDismissStorageKey(), '1')
  } catch {
    // ignore
  }
}

/** Run only after auth session exists and profile fetch has finished (`loading === false`). */
export function shouldShowWhatsNewUpdatePopup(profile: Profile | null, loading: boolean): boolean {
  if (loading || !profile) return false
  if (!profile.has_seen_tutorial) return false
  if (profile.needs_coaching_workspace_setup) return false
  if (hasSeenWhatsNewForCurrentVersion()) return false
  return true
}
