/**
 * Dev/admin: print recent feedback rows (requires service role; run locally with .env).
 * Usage: npm run feedback:list
 * Optional: npm run feedback:list -- 20   (limit, max 100)
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

const url = process.env.SUPABASE_URL?.trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (same .env as the API server).')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const limit = Math.min(100, Math.max(1, Number(process.argv[2]) || 40))
const { data, error } = await supabase
  .from('feedback')
  .select('id, user_id, user_email, message, follow_up_email, created_at')
  .order('created_at', { ascending: false })
  .limit(limit)

if (error) {
  console.error(error.message)
  process.exit(1)
}

console.log(JSON.stringify(data, null, 2))
