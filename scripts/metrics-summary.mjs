import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL?.trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

const { data: events, error } = await admin
  .from('product_events')
  .select('event_name, created_at')
  .gte('created_at', since)

if (error) {
  console.error('Could not load product_events:', error.message)
  console.error('Did you apply supabase/migrations/017_product_events.sql?')
  process.exit(1)
}

/** @type {Record<string, number>} */
const counts = {}
for (const row of events ?? []) {
  const name = row.event_name || 'unknown'
  counts[name] = (counts[name] ?? 0) + 1
}

console.log('Trackora funnel (last 7 days, server-side events)')
console.log('Since:', since)
console.log('')
for (const [name, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${name.padEnd(28)} ${n}`)
}
console.log('')
console.log('Total events:', events?.length ?? 0)
