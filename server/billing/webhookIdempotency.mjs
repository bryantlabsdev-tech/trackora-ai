/** @type {Map<string, number>} eventId → processedAt ms */
const processed = new Map()
const MAX_ENTRIES = 2_000
const TTL_MS = 24 * 60 * 60 * 1000

function prune() {
  const now = Date.now()
  for (const [id, at] of processed) {
    if (now - at > TTL_MS) processed.delete(id)
  }
  if (processed.size <= MAX_ENTRIES) return
  const sorted = [...processed.entries()].sort((a, b) => a[1] - b[1])
  const drop = sorted.length - MAX_ENTRIES
  for (let i = 0; i < drop; i++) processed.delete(sorted[i][0])
}

/**
 * Stripe may retry webhooks; skip duplicate event ids within TTL.
 * @param {string} eventId
 * @returns {boolean} true if this event was already processed
 */
export function isDuplicateStripeEvent(eventId) {
  if (!eventId || typeof eventId !== 'string') return false
  prune()
  if (processed.has(eventId)) return true
  processed.set(eventId, Date.now())
  return false
}

/** @param {string} eventId — test helper */
export function markStripeEventProcessed(eventId) {
  processed.set(eventId, Date.now())
}

/** Test helper */
export function resetStripeEventIdempotencyForTests() {
  processed.clear()
}
