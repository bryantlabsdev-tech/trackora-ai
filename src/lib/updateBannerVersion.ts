/**
 * Bump `CURRENT_UPDATE_BANNER_VERSION` to show the “What’s New” modal again for returning users.
 * Dismissal is stored in localStorage per version (see `getWhatsNewDismissStorageKey`).
 */
export const CURRENT_UPDATE_BANNER_VERSION = 'v1'

export function getWhatsNewDismissStorageKey(): string {
  return `trackoraai_seen_update_${CURRENT_UPDATE_BANNER_VERSION}`
}
