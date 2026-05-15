import { supabaseAdmin } from '../config.mjs'

/**
 * Record a server-side product event (no third-party analytics SDK).
 * Failures are logged but never block the user request.
 * @param {string | null} userId
 * @param {string} eventName
 * @param {Record<string, unknown>} [metadata]
 */
export async function logProductEvent(userId, eventName, metadata = {}) {
  if (!supabaseAdmin) return
  const name = String(eventName ?? '').trim()
  if (!name) return

  const row = {
    user_id: userId && typeof userId === 'string' ? userId : null,
    event_name: name.slice(0, 120),
    metadata:
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? JSON.parse(JSON.stringify(metadata))
        : {},
  }

  const { error } = await supabaseAdmin.from('product_events').insert(row)
  if (error) {
    console.warn('[product_events] insert failed:', error.message, { eventName: name })
  }
}

/**
 * @param {string | null} userId
 * @param {{ source: string; mode?: string; workspace?: string }} meta
 * @param {boolean} [isTutorialRun]
 */
export function trackCoachingGenerated(userId, meta, isTutorialRun = false) {
  if (isTutorialRun || !userId) return
  void logProductEvent(userId, 'coaching_log_generated', meta)
}
