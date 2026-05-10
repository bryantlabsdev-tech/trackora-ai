#!/usr/bin/env node
/**
 * One-time / dev: resync all profiles with Stripe customer or subscription IDs.
 *
 * Usage (from repo root, with .env loaded):
 *   node scripts/resync-stripe-billing.mjs
 *   node scripts/resync-stripe-billing.mjs --dry-run
 *
 * Requires: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { resyncAllProfilesFromStripe } from '../shared/resyncStripeProfiles.mjs'

const dryRun = process.argv.includes('--dry-run')

const stripeKey = process.env.STRIPE_SECRET_KEY?.trim()
const supabaseUrl = process.env.SUPABASE_URL?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!stripeKey || !supabaseUrl || !serviceKey) {
  console.error('Missing STRIPE_SECRET_KEY, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const stripe = new Stripe(stripeKey)
const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

console.log('[resync-stripe-billing] starting', { dryRun })

const summary = await resyncAllProfilesFromStripe(stripe, supabaseAdmin, {
  dryRun,
  onProgress: (e) => {
    if (e.error || e.updated || e.dryRun) console.log(JSON.stringify(e))
  },
})

console.log('[resync-stripe-billing] summary:', summary)
process.exit(summary.errors > 0 ? 1 : 0)
