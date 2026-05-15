import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import OpenAI from 'openai'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { dedupePriceIds } from '../shared/eliteUpgrade.mjs'
import { PRO_MONTHLY_REFINEMENT_LIMIT_DEFAULT } from '../shared/refinementQuota.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envFilePath = path.resolve(__dirname, '..', '.env')
dotenv.config({ path: envFilePath, override: true })

export const debugLog = (...args) => {
  if (process.env.NODE_ENV !== 'production') console.log(...args)
}

export const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

export const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || ''
export const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null

export const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim() || ''
export const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null
export const FREE_LIMIT = Number.parseInt(process.env.FREE_LIMIT || '3', 10)
export const PRO_MONTHLY_REFINEMENT_LIMIT =
  Number.parseInt(process.env.PRO_MONTHLY_REFINEMENT_LIMIT || String(PRO_MONTHLY_REFINEMENT_LIMIT_DEFAULT), 10) ||
  PRO_MONTHLY_REFINEMENT_LIMIT_DEFAULT
export const stripePriceId =
  process.env.STRIPE_PRICE_ID?.trim() ||
  process.env.STRIPE_PRO_PRICE_ID?.trim() ||
  'price_1TJaIIHG6iuq9JCNXyc4I5Hb'
/** Set in Stripe + `.env` to enable Elite checkout and subscription tier sync (`STRIPE_ELITE_PRICE_ID`). */
export const stripeElitePriceId = process.env.STRIPE_ELITE_PRICE_ID?.trim() || ''

export function configuredProPriceIds() {
  return dedupePriceIds([process.env.STRIPE_PRICE_ID, process.env.STRIPE_PRO_PRICE_ID, stripePriceId])
}

/**
 * @param {unknown} err
 * @returns {string}
 */
export function stripeEliteUpgradeErrorMessage(err) {
  const e = err && typeof err === 'object' ? err : {}
  const t = String(e.type || '')
  if (t === 'StripeCardError' || e.code === 'card_declined') {
    return typeof e.message === 'string' && e.message.trim()
      ? e.message.trim()
      : 'Your card was declined. You remain on your current plan until payment succeeds.'
  }
  if (typeof e.message === 'string' && e.message.trim()) return e.message.trim()
  return 'Upgrade could not be completed. Please try again or use the billing portal.'
}

export const supabaseUrl = process.env.SUPABASE_URL?.trim() || ''
export const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''
export const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null

/** In-memory cooldown so login reconcile does not hammer Stripe. */
export const billingReconcileCooldown = new Map()
export const BILLING_RECONCILE_COOLDOWN_MS = 5 * 60 * 1000

