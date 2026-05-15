import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import rateLimit from 'express-rate-limit'
import cors from 'cors'
import { formatPersonName, polishGeneratedCoachingForm } from '../shared/coachingOutput.mjs'
import {
  buildCoachingClassRules,
  buildDeterministicCoachingForm,
  classifyIssue,
  normalizeIssueText,
} from '../shared/coachingIssueClassifier.mjs'
import { isLightReminderCoaching } from '../shared/coachingReminderTone.mjs'
import { sanitizeCoachingPayload } from '../shared/sanitizeCoachingPayload.mjs'
import {
  buildRefinementDirective,
  sanitizeRefineSectionPayload,
  validateRefineSectionPayload,
} from '../shared/refineSectionPayload.mjs'
import {
  buildTopicRetryUserMessage,
  coachingOutputViolatesTopicAnchor,
} from '../shared/coachingTopicValidation.mjs'
import { evaluateSubscriptionAccess, profileRowGrantsPremium } from '../shared/billingSubscription.mjs'
import { effectivePremiumAccess, isOwnerFreePro } from '../shared/ownerFreePro.mjs'
import { canUseRefinements, isElitePlan, isProPlan } from '../shared/planAccess.mjs'
import {
  effectiveRefinementCountThisMonth,
  parseRefinementRow,
  refinementMonthKeyUtc,
} from '../shared/refinementQuota.mjs'
import { resyncAllProfilesFromStripe } from '../shared/resyncStripeProfiles.mjs'
import { findSubscriptionItemForEliteUpgrade } from '../shared/eliteUpgrade.mjs'
import { inferBillingPlanTierFromSubscription } from '../shared/stripePlanTier.mjs'

import {
  debugLog,
  MODEL,
  openai,
  stripe,
  FREE_LIMIT,
  PRO_MONTHLY_REFINEMENT_LIMIT,
  stripePriceId,
  stripeElitePriceId,
  configuredProPriceIds,
  stripeEliteUpgradeErrorMessage,
  supabaseAdmin,
} from './config.mjs'
import {
  pickStripeId,
  resolveProfileIdForBilling,
  syncSubscriptionToUser,
  reconcileStripeSubscriptionForUser,
  respondStripeWebhookSync,
} from './billing/sync.mjs'
import { callOpenAIChat, callOpenAIChatWithOneRetry } from './openai/client.mjs'
import {
  normalizeAiRouteAction,
  buildRefineSectionPrompt,
  buildCoachingLogMessages,
} from './ai/messages.mjs'
import { parseApiAiRequest, parseCreateCheckoutSession } from './validation/schemas.mjs'
import { handleStripeWebhookEvent } from './billing/stripeWebhookHandler.mjs'
import { setupSentryExpress, captureServerException } from './sentry.mjs'
import { logProductEvent, trackCoachingGenerated } from './lib/productEvents.mjs'
import { securityHeaders } from './middleware/securityHeaders.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.set('trust proxy', 1)
app.use(securityHeaders)

/**
 * Vite output is `dist/` (`npm run build`). On Render, cwd is usually the service root, but we also
 * resolve relative to this file so `node server/index.mjs` works from any cwd. Optional override:
 * `FRONTEND_DIST=/absolute/or/relative/path` (e.g. if Root Directory in Render is a subfolder).
 * @returns {{ distDir: string, indexHtmlPath: string, found: boolean }}
 */
function resolveFrontendDist() {
  const envDir = process.env.FRONTEND_DIST?.trim()
  const candidates = []
  if (envDir) candidates.push(path.resolve(envDir))
  candidates.push(path.resolve(__dirname, '..', 'dist'))
  candidates.push(path.resolve(process.cwd(), 'dist'))

  const seen = new Set()
  for (const dir of candidates) {
    if (seen.has(dir)) continue
    seen.add(dir)
    const indexHtmlPath = path.join(dir, 'index.html')
    if (fs.existsSync(indexHtmlPath)) {
      return { distDir: dir, indexHtmlPath, found: true }
    }
  }

  const fallback = path.resolve(__dirname, '..', 'dist')
  return {
    distDir: fallback,
    indexHtmlPath: path.join(fallback, 'index.html'),
    found: false,
  }
}

const { distDir, indexHtmlPath, found: hasFrontendBuild } = resolveFrontendDist()

console.log('[static] server __dirname:', __dirname)
console.log('[static] process.cwd():', process.cwd())
console.log('[static] FRONTEND_DIST:', process.env.FRONTEND_DIST?.trim() || '(unset)')
console.log('[static] distDir:', distDir)
console.log('[static] index.html exists:', hasFrontendBuild, '→', indexHtmlPath)
if (hasFrontendBuild) {
  try {
    const entries = fs.readdirSync(distDir)
    console.log('[static] dist entries:', entries.slice(0, 12).join(', '), entries.length > 12 ? '…' : '')
  } catch (e) {
    console.warn('[static] could not read dist:', e?.message)
  }
}

app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || ''
  if (!stripe || !webhookSecret) {
    console.error('[webhook/stripe] Missing Stripe client or STRIPE_WEBHOOK_SECRET')
    return res.status(503).send('Webhook not configured')
  }

  const sig = req.headers['stripe-signature']
  if (!sig || typeof sig !== 'string') {
    console.error('[webhook/stripe] Missing stripe-signature header')
    return res.status(400).send('Missing signature')
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
  } catch (err) {
    const msg = typeof err?.message === 'string' ? err.message : 'invalid payload'
    console.error('[webhook/stripe] Signature verification failed:', msg)
    return res.status(400).send(`Webhook Error: ${msg}`)
  }

  return handleStripeWebhookEvent(event, res, { stripe, respondStripeWebhookSync })
})

app.use(cors({ origin: true }))
/** Coaching + section refine send full form context — allow modest payloads. */
app.use(express.json({ limit: '512kb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'trackora-api',
    timestamp: new Date().toISOString(),
    openai: Boolean(openai),
    stripe: Boolean(stripe),
    supabase: Boolean(supabaseAdmin),
  })
})

const apiAiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      ok: false,
      code: 'RATE_LIMIT',
      error: 'Too many requests. Please try again in a few minutes.',
    })
  },
})

/**
 * @param {import('express').Request} req
 * @returns {Promise<{ userId: string | null; email: string | null; error: string | null }>}
 */
async function getAuthenticatedUserId(req) {
  if (!supabaseAdmin) {
    return { userId: null, email: null, error: 'Database is not configured.' }
  }

  const authHeader = req.headers.authorization
  const bearerPrefix = 'Bearer '
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith(bearerPrefix)) {
    return { userId: null, email: null, error: 'Missing or invalid authorization header.' }
  }

  const token = authHeader.slice(bearerPrefix.length).trim()
  if (!token) {
    return { userId: null, email: null, error: 'Missing access token.' }
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user?.id) {
    return { userId: null, email: null, error: 'Could not verify user session.' }
  }

  return { userId: String(data.user.id), email: data.user.email ?? null, error: null }
}

async function getProfileForUser(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(
      'id, email, is_pro, plan_tier, usage_count, subscription_status, current_period_end, refinement_count, refinement_month, stripe_customer_id, stripe_subscription_id, coaching_workspace',
    )
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) {
    return { profile: null, error: error?.message || 'Could not load profile.' }
  }
  return { profile: data, error: null }
}

/**
 * Zero refinement_count when UTC calendar month changes (lazy monthly reset).
 * @param {string} userId
 * @param {Record<string, unknown>} profile
 */
async function ensureRefinementMonthReset(userId, profile) {
  if (!supabaseAdmin || !profile) return profile
  const currentMonth = refinementMonthKeyUtc()
  const { monthKey } = parseRefinementRow(profile)
  if (monthKey === currentMonth) return profile

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ refinement_count: 0, refinement_month: currentMonth })
    .eq('id', userId)
    .select(
      'id, email, is_pro, plan_tier, usage_count, subscription_status, current_period_end, refinement_count, refinement_month, coaching_workspace',
    )
    .single()

  if (error || !data) {
    console.error('[refinement] month reset failed', error?.message)
    return { ...profile, refinement_count: 0, refinement_month: currentMonth }
  }
  return data
}

/**
 * @param {Record<string, unknown>} profile
 * @param {string | null} authEmail
 */
function refinementQuotaForResponse(profile, authEmail) {
  if (isElitePlan(profile, authEmail) || isOwnerFreePro(authEmail)) {
    return {
      refinementUsedThisMonth: 0,
      refinementLimit: PRO_MONTHLY_REFINEMENT_LIMIT,
      refinementRemaining: null,
      refinementUnlimited: true,
    }
  }
  const used = effectiveRefinementCountThisMonth(profile)
  return {
    refinementUsedThisMonth: used,
    refinementLimit: PRO_MONTHLY_REFINEMENT_LIMIT,
    refinementRemaining: Math.max(0, PRO_MONTHLY_REFINEMENT_LIMIT - used),
    refinementUnlimited: false,
  }
}

/**
 * Increment refinement usage after a successful OpenAI refine (Pro only; owner skips).
 * @param {string} userId
 */
async function incrementMonthlyRefinementCount(userId) {
  if (!supabaseAdmin) return null
  const currentMonth = refinementMonthKeyUtc()
  const { data: row, error: readErr } = await supabaseAdmin
    .from('profiles')
    .select('refinement_count, refinement_month')
    .eq('id', userId)
    .maybeSingle()
  if (readErr) {
    console.error('[refinement] read before increment', readErr.message)
    return null
  }
  const eff = effectiveRefinementCountThisMonth(row)
  const next = eff + 1
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ refinement_count: next, refinement_month: currentMonth })
    .eq('id', userId)
    .select(
      'id, email, is_pro, plan_tier, usage_count, subscription_status, current_period_end, refinement_count, refinement_month',
    )
    .single()
  if (error) {
    console.error('[refinement] increment failed', error.message)
    return null
  }
  return data
}

function usageEnvelope(profile, authEmail) {
  const raw = Number(profile?.usage_count ?? 0)
  const usageCount = Number.isFinite(raw) ? Math.trunc(raw) : 0
  const isPro = effectivePremiumAccess(profile, authEmail)
  const remaining = isPro ? Number.POSITIVE_INFINITY : FREE_LIMIT - usageCount
  return { usageCount, isPro, remaining, freeLimit: FREE_LIMIT }
}

async function recordServerSideGenerationUsage(userId, authEmail) {
  if (!supabaseAdmin) return
  const profileResult = await getProfileForUser(userId)
  if (!profileResult.profile || profileResult.error) {
    console.error('SERVER_USAGE_UPDATE_ERROR', { userId, error: profileResult.error || 'profile_missing' })
    return null
  }
  const profile = profileResult.profile
  if (effectivePremiumAccess(profile, authEmail)) {
    const snapshot = usageEnvelope(profile, authEmail)
    debugLog('SERVER_USAGE_APPLY', {
      userId,
      isPro: true,
      usageCountBefore: snapshot.usageCount,
      usageCountAfter: snapshot.usageCount,
      freeLimit: FREE_LIMIT,
      remaining: snapshot.remaining,
    })
    return profile
  }
  const rawBefore = Number(profile.usage_count ?? 0)
  const usageBefore = Number.isFinite(rawBefore) ? Math.trunc(rawBefore) : 0
  const { data: updatedRow, error } = await supabaseAdmin
    .from('profiles')
    .update({ usage_count: usageBefore + 1 })
    .eq('id', userId)
    .select('id, is_pro, usage_count')
    .single()
  if (error) {
    console.error('SERVER_USAGE_UPDATE_ERROR', { userId, error: error.message })
    return null
  }
  const rawAfter = Number(updatedRow?.usage_count ?? 0)
  const usageAfter = Number.isFinite(rawAfter) ? Math.trunc(rawAfter) : 0
  const remaining = FREE_LIMIT - usageAfter
  debugLog('SERVER_USAGE_APPLY', {
    userId,
    isPro: false,
    usageCountBefore: usageBefore,
    usageCountAfter: usageAfter,
    freeLimit: FREE_LIMIT,
    remaining,
  })
  return updatedRow
}

app.post('/create-checkout-session', async (req, res) => {
  const checkoutParsed = parseCreateCheckoutSession(req.body)
  if (!checkoutParsed.ok) {
    return res.status(400).json({ error: checkoutParsed.error })
  }

  const stripeKeyEnv = process.env.STRIPE_SECRET_KEY?.trim() || ''
  console.log('[create-checkout-session] STRIPE_SECRET_KEY present:', Boolean(stripeKeyEnv))
  if (stripeKeyEnv.startsWith('sk_test_')) {
    console.log('[create-checkout-session] Stripe key mode: test')
  } else if (stripeKeyEnv.startsWith('sk_live_')) {
    console.log('[create-checkout-session] Stripe key mode: live')
  } else {
    console.log('[create-checkout-session] Stripe key mode: unknown')
  }

  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured (missing STRIPE_SECRET_KEY).' })
  }
  const appUrl = process.env.APP_URL?.trim()?.replace(/\/$/, '') || ''
  if (!appUrl) {
    return res.status(503).json({ error: 'APP_URL is not configured.' })
  }

  const userId = checkoutParsed.data.userId
  const emailMeta = checkoutParsed.data.email?.trim() ?? ''
  const checkoutPlan = checkoutParsed.data.planTier === 'elite' ? 'elite' : 'pro'
  const checkoutMetadata = {
    userId,
    planTier: checkoutPlan,
    ...(emailMeta ? { email: emailMeta } : {}),
  }
  console.log('[create-checkout-session] checkout metadata (safe):', {
    userId,
    emailAttached: Boolean(emailMeta),
    planTier: checkoutPlan,
  })

  if (checkoutPlan === 'elite') {
    return res.status(400).json({
      error:
        'Elite signup requires a signed-in request. Use POST /api/billing/start-elite with Authorization (prevents duplicate subscriptions for Pro users).',
    })
  }

  const priceId = stripePriceId

  try {
    console.log('[create-checkout-session] Stripe price id:', priceId, 'plan:', checkoutPlan)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}`,
      metadata: checkoutMetadata,
      client_reference_id: userId,
      subscription_data: {
        metadata: { userId },
      },
    })
    if (!session.url) {
      return res.status(500).json({ error: 'Checkout session missing URL.' })
    }
    void logProductEvent(userId, 'checkout_session_started', { planTier: checkoutPlan })
    return res.json({ url: session.url })
  } catch (e) {
    const message = typeof e?.message === 'string' ? e.message : 'Checkout session failed'
    console.error('[create-checkout-session]', message)
    return res.status(500).json({ error: message })
  }
})

async function handleCreateCustomerPortalSession(req, res) {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured (missing STRIPE_SECRET_KEY).' })
  }
  const appUrl = process.env.APP_URL?.trim()?.replace(/\/$/, '') || ''
  if (!appUrl) {
    return res.status(503).json({ error: 'APP_URL is not configured.' })
  }
  const auth = await getAuthenticatedUserId(req)
  if (auth.error || !auth.userId) {
    console.error('[create-customer-portal-session] auth failed:', auth.error)
    return res.status(401).json({ error: auth.error || 'Unauthorized.' })
  }
  const userId = auth.userId
  console.log('[create-customer-portal-session] authenticated user id:', userId)

  const { data: row, error } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id, stripe_subscription_id, is_pro, subscription_status, current_period_end')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('[create-customer-portal-session] Supabase:', error.message)
    return res.status(500).json({ error: 'Could not load account.' })
  }
  if (!row) {
    console.error('[create-customer-portal-session] profile row not found for user:', userId)
    return res.status(404).json({ error: 'No profile found for this user.' })
  }
  console.log('[create-customer-portal-session] profile lookup result:', {
    userId,
    hasRow: Boolean(row),
    isPro: row?.is_pro ?? null,
    subscriptionStatus: row?.subscription_status ?? null,
    currentPeriodEnd: row?.current_period_end ?? null,
  })

  let customerId =
    row && typeof row.stripe_customer_id === 'string' ? row.stripe_customer_id.trim() : ''
  const subscriptionId =
    row && typeof row.stripe_subscription_id === 'string' ? row.stripe_subscription_id.trim() : ''
  console.log('[create-customer-portal-session] profile billing ids:', {
    userId,
    stripe_customer_id: customerId || null,
    stripe_subscription_id: subscriptionId || null,
  })

  // Recover missing customer id from subscription if it exists.
  if (!customerId && subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const recoveredCustomerId = pickStripeId(subscription.customer)
      if (recoveredCustomerId) {
        customerId = recoveredCustomerId
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({ stripe_customer_id: recoveredCustomerId })
          .eq('id', userId)
        if (updateError) {
          console.error(
            '[create-customer-portal-session] failed to persist recovered customer id:',
            updateError.message,
          )
        } else {
          console.log('[create-customer-portal-session] recovered customer id from subscription for user:', userId)
        }
      }
    } catch (e) {
      console.error(
        '[create-customer-portal-session] failed recovering customer id from subscription:',
        {
          message: typeof e?.message === 'string' ? e.message : 'unknown error',
          type: e?.type ?? null,
          code: e?.code ?? null,
          statusCode: e?.statusCode ?? null,
          requestId: e?.requestId ?? null,
          raw: e?.raw ?? null,
          rawType: e?.rawType ?? null,
          param: e?.param ?? null,
          userId,
          stripe_subscription_id: subscriptionId || null,
        },
      )
    }
  }

  if (!customerId) {
    console.error('[create-customer-portal-session] missing stripe customer and subscription ids', {
      userId,
      hasSubscriptionId: Boolean(subscriptionId),
    })
    return res.status(400).json({
      error: 'No Stripe customer found for this user',
    })
  }

  try {
    console.log('[create-customer-portal-session] creating Stripe billing portal session:', {
      userId,
      stripe_customer_id: customerId,
    })
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/app`,
    })
    if (!session.url) {
      return res.status(500).json({ error: 'Billing portal session missing URL.' })
    }
    console.log('[create-customer-portal-session] ok for user:', {
      userId,
      customerId,
      subscriptionStatus: row?.subscription_status ?? null,
      currentPeriodEnd: row?.current_period_end ?? null,
      isPro: row?.is_pro ?? null,
    })
    return res.json({ url: session.url })
  } catch (e) {
    const message = typeof e?.message === 'string' ? e.message : 'Billing portal failed'
    console.error('[create-customer-portal-session] Stripe billing portal creation failed:', {
      message,
      type: e?.type ?? null,
      code: e?.code ?? null,
      statusCode: e?.statusCode ?? null,
      requestId: e?.requestId ?? null,
      raw: e?.raw ?? null,
      rawType: e?.rawType ?? null,
      param: e?.param ?? null,
      userId,
      stripe_customer_id: customerId,
    })
    return res.status(500).json({ error: message })
  }
}

/**
 * Authenticated: re-fetch subscription from Stripe and sync profiles (webhook backup).
 */
/**
 * Authenticated Elite: Free → Checkout (new subscription); Pro → same subscription, swap price + proration invoice.
 * Prevents duplicate subscriptions when upgrading from Pro.
 */
async function handleStartElite(req, res) {
  const appUrl = process.env.APP_URL?.trim()?.replace(/\/$/, '') || ''
  if (!stripe || !supabaseAdmin) {
    return res.status(503).json({ ok: false, error: 'Billing is not configured.' })
  }
  if (!stripeElitePriceId) {
    return res.status(503).json({
      ok: false,
      error: 'Elite is not configured. Set STRIPE_ELITE_PRICE_ID on the server.',
    })
  }
  if (!appUrl) {
    return res.status(503).json({ ok: false, error: 'APP_URL is not configured.' })
  }

  const auth = await getAuthenticatedUserId(req)
  if (auth.error || !auth.userId) {
    return res.status(401).json({ ok: false, error: auth.error || 'Unauthorized.' })
  }

  const profileResult = await getProfileForUser(auth.userId)
  if (!profileResult.profile || profileResult.error) {
    return res.status(500).json({ ok: false, error: profileResult.error || 'Could not load profile.' })
  }
  const profile = profileResult.profile
  const sessionEmail = auth.email ?? profile.email ?? null

  if (isElitePlan(profile, sessionEmail) || isOwnerFreePro(sessionEmail)) {
    return res.json({
      ok: true,
      mode: 'already_elite',
      message: "You're already on Elite.",
    })
  }

  if (!effectivePremiumAccess(profile, sessionEmail)) {
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: stripeElitePriceId, quantity: 1 }],
        success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}`,
        metadata: {
          userId: auth.userId,
          planTier: 'elite',
          ...(typeof profile.email === 'string' && profile.email.trim() ? { email: profile.email.trim() } : {}),
        },
        client_reference_id: auth.userId,
        subscription_data: {
          metadata: { userId: auth.userId, planTier: 'elite' },
        },
      })
      if (!session.url) {
        return res.status(500).json({ ok: false, error: 'Checkout session missing URL.' })
      }
      void logProductEvent(auth.userId, 'elite_upgrade_started', { mode: 'checkout' })
      return res.json({ ok: true, mode: 'checkout', url: session.url })
    } catch (e) {
      const msg = typeof e?.message === 'string' ? e.message : 'Checkout failed'
      console.error('[start-elite] checkout', msg)
      return res.status(500).json({ ok: false, error: msg })
    }
  }

  const subIdRaw = typeof profile.stripe_subscription_id === 'string' ? profile.stripe_subscription_id.trim() : ''
  if (!subIdRaw) {
    return res.status(400).json({
      ok: false,
      error:
        'No subscription is linked to this account. Subscribe to Pro first, or use the billing portal.',
    })
  }

  let subscription
  try {
    subscription = await stripe.subscriptions.retrieve(subIdRaw)
  } catch (e) {
    console.error('[start-elite] retrieve subscription', e?.message)
    return res.status(400).json({ ok: false, error: 'Could not load your Stripe subscription.' })
  }

  if (String(subscription.id) !== subIdRaw) {
    return res.status(400).json({ ok: false, error: 'Subscription mismatch. Please contact support.' })
  }

  const customerId = pickStripeId(subscription.customer)
  const metaUid = typeof subscription.metadata?.userId === 'string' ? subscription.metadata.userId.trim() : ''
  const profCust = typeof profile.stripe_customer_id === 'string' ? profile.stripe_customer_id.trim() : ''
  const custOk = !profCust || (Boolean(customerId) && profCust === customerId)
  const metaOk = Boolean(metaUid) && metaUid === auth.userId
  if (!custOk && !metaOk) {
    return res.status(403).json({
      ok: false,
      error: 'This subscription is not linked to your account. Open the billing portal or contact support.',
    })
  }

  if (inferBillingPlanTierFromSubscription(subscription, stripeElitePriceId) === 'elite') {
    const cust = customerId || profCust
    if (cust) {
      await syncSubscriptionToUser({
        eventType: 'elite.start.already_elite',
        customerId: cust,
        subscription,
        metadataUserId: metaUid || auth.userId,
      })
    }
    return res.json({ ok: true, mode: 'already_elite', message: "You're already on Elite." })
  }

  const proIds = configuredProPriceIds()
  const pick = findSubscriptionItemForEliteUpgrade(subscription, proIds, stripeElitePriceId)
  if (pick.alreadyElite) {
    return res.json({ ok: true, mode: 'already_elite', message: "You're already on Elite." })
  }
  if (!pick.subscriptionItemId) {
    return res.status(400).json({
      ok: false,
      error:
        'Could not find a subscription line to upgrade. Use the Stripe billing portal or contact support.',
    })
  }

  try {
    const updated = await stripe.subscriptions.update(subIdRaw, {
      items: [{ id: pick.subscriptionItemId, price: stripeElitePriceId }],
      proration_behavior: 'always_invoice',
    })
    const cust = pickStripeId(updated.customer) || customerId || profCust
    if (!cust) {
      console.error('[start-elite] missing customer after update')
      return res.status(500).json({ ok: false, error: 'Upgrade succeeded but billing sync failed (missing customer).' })
    }
    await syncSubscriptionToUser({
      eventType: 'elite_upgrade.pro_to_elite',
      customerId: cust,
      subscription: updated,
      metadataUserId: metaUid || auth.userId,
    })
    void logProductEvent(auth.userId, 'elite_upgrade_started', { mode: 'subscription_updated' })
    return res.json({ ok: true, mode: 'subscription_updated' })
  } catch (e) {
    const msg = stripeEliteUpgradeErrorMessage(e)
    const isCard = e?.type === 'StripeCardError' || e?.code === 'card_declined'
    const code = isCard ? 'PAYMENT_FAILED' : 'STRIPE_ERROR'
    const status = isCard ? 402 : 400
    console.error('[start-elite] subscription.update failed', {
      type: e?.type,
      code: e?.code,
      message: e?.message,
    })
    return res.status(status).json({ ok: false, code, error: msg })
  }
}

async function handleBillingReconcileSubscription(req, res) {
  if (!stripe) {
    return res.status(503).json({ ok: false, error: 'Stripe is not configured.' })
  }
  const auth = await getAuthenticatedUserId(req)
  if (auth.error || !auth.userId) {
    return res.status(401).json({ ok: false, error: auth.error || 'Unauthorized.' })
  }
  const force =
    req.query?.force === '1' ||
    req.query?.force === 'true' ||
    (req.body && typeof req.body === 'object' && req.body.force === true)
  console.log('[billing-reconcile] HTTP request', { userId: auth.userId, force: Boolean(force) })
  const result = await reconcileStripeSubscriptionForUser(auth.userId, { force })
  if (!result.ok && result.skipped === 'cooldown') {
    return res.json({ ok: true, skipped: 'cooldown' })
  }
  if (!result.ok && result.skipped === 'no_stripe_subscription') {
    return res.json({ ok: true, skipped: 'no_stripe_subscription' })
  }
  if (!result.ok) {
    const code = result.skipped === 'stripe_retrieve_error' || result.skipped === 'stripe_list_error' ? 502 : 500
    return res.status(code).json({ ok: false, ...result })
  }
  return res.json({ ok: true, result })
}

/**
 * Dev/admin: resync every profile that has Stripe IDs (header secret).
 * Set TRACKORA_BILLING_RESYNC_SECRET in the server environment.
 */
async function handleBillingAdminResyncAll(req, res) {
  const secret = process.env.TRACKORA_BILLING_RESYNC_SECRET?.trim()
  if (!secret) {
    return res.status(503).json({ ok: false, error: 'TRACKORA_BILLING_RESYNC_SECRET is not set.' })
  }
  const headerSecret =
    (typeof req.headers['x-trackora-billing-resync-secret'] === 'string'
      ? req.headers['x-trackora-billing-resync-secret'].trim()
      : '') || (typeof req.body?.secret === 'string' ? req.body.secret.trim() : '')
  if (headerSecret !== secret) {
    console.warn('[billing-admin-resync] unauthorized attempt')
    return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  }
  if (!stripe || !supabaseAdmin) {
    return res.status(503).json({ ok: false, error: 'Stripe or Supabase not configured.' })
  }
  const dryRun = req.body?.dryRun === true || req.query?.dryRun === '1'
  console.log('[billing-admin-resync] starting', { dryRun })
  try {
    const summary = await resyncAllProfilesFromStripe(stripe, supabaseAdmin, {
      dryRun,
      onProgress: (e) => {
        if (e.error || e.updated) console.log('[billing-admin-resync]', e)
      },
    })
    console.log('[billing-admin-resync] done', summary)
    return res.json({ ok: true, summary })
  } catch (e) {
    const msg = typeof e?.message === 'string' ? e.message : 'resync failed'
    console.error('[billing-admin-resync] fatal', msg)
    return res.status(500).json({ ok: false, error: msg })
  }
}

app.post('/api/create-customer-portal-session', handleCreateCustomerPortalSession)
app.post('/create-billing-portal-session', handleCreateCustomerPortalSession)
app.post('/api/billing/start-elite', handleStartElite)
app.post('/api/billing/reconcile-subscription', handleBillingReconcileSubscription)
app.post('/api/billing/admin/resync-all', handleBillingAdminResyncAll)

app.post('/api/ai', apiAiRateLimiter, async (req, res) => {
  debugLog('SERVER_API_AI_HIT')
  const authHeader = req.headers.authorization
  if (!authHeader || typeof authHeader !== 'string') {
    return res.status(401).json({ ok: false, error: 'Unauthorized' })
  }

  const bodyParsed = parseApiAiRequest(req.body)
  if (!bodyParsed.ok) {
    return res.status(400).json({ ok: false, error: bodyParsed.error })
  }

  let payload = bodyParsed.data.payload
  let isTutorialRun = false
  let authUserId = null
  let authUserEmail = null
  let usageSnapshot = null

  debugLog('SERVER_API_AI_AUTH_HEADER_EXISTS', Boolean(req.headers.authorization))
  const auth = await getAuthenticatedUserId(req)
  if (auth.error || !auth.userId) {
    return res.status(401).json({ ok: false, error: auth.error || 'Unauthorized.' })
  }
  authUserId = auth.userId
  authUserEmail = auth.email
  debugLog('SERVER_API_AI_USER', { userId: authUserId, email: authUserEmail })

  const action = normalizeAiRouteAction(bodyParsed.data.action)
  if (!action) {
    return res.status(400).json({ ok: false, error: 'Missing or invalid action.' })
  }

  /**
   * refine_section runs first and returns — never passes through "unknown action".
   * Uses normalized action string (NFKC + casing) so routing cannot silently fail.
   */
  if (action === 'refine_section') {
    const refinePayload = sanitizeRefineSectionPayload(payload)
    const verr = validateRefineSectionPayload(refinePayload)
    if (verr) {
      return res.status(400).json({ ok: false, error: verr })
    }

    const profileResult = await getProfileForUser(authUserId)
    if (!profileResult.profile || profileResult.error) {
      return res.status(500).json({ ok: false, error: profileResult.error || 'Could not load profile.' })
    }
    let profile = await ensureRefinementMonthReset(authUserId, profileResult.profile)

    if (!canUseRefinements(profile, authUserEmail)) {
      return res.status(403).json({
        ok: false,
        code: 'REFINEMENT_REQUIRES_PRO',
        error: 'Section refinements are available on Pro and Elite.',
      })
    }

    if (isProPlan(profile, authUserEmail)) {
      const used = effectiveRefinementCountThisMonth(profile)
      if (used >= PRO_MONTHLY_REFINEMENT_LIMIT) {
        return res.status(403).json({
          ok: false,
          code: 'REFINEMENT_MONTHLY_LIMIT_REACHED',
          error: "You've reached your monthly refinement limit.",
        })
      }
    }

    usageSnapshot = usageEnvelope(profile, authUserEmail)
    debugLog('SERVER_API_AI_USAGE_CHECK', {
      userId: authUserId,
      isPro: usageSnapshot.isPro,
      usageCount: usageSnapshot.usageCount,
      freeLimit: FREE_LIMIT,
      action: 'refine_section',
      refinementsUsed: effectiveRefinementCountThisMonth(profile),
      refinementLimit: PRO_MONTHLY_REFINEMENT_LIMIT,
    })

    if (!openai) {
      return res.status(503).json({
        ok: false,
        error: 'Section refinement requires AI (OpenAI is not configured).',
      })
    }

    try {
      const prompt = buildRefineSectionPrompt(refinePayload)
      const chatMessages = [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ]
      const raw = await callOpenAIChatWithOneRetry(chatMessages, {
        maxTokens: 700,
        temperature: 0.48,
      })
      const polishedName = formatPersonName(refinePayload.employeeName ?? '')
      const polished = polishGeneratedCoachingForm(raw.trim(), polishedName)

      if (isProPlan(profile, authUserEmail)) {
        const updatedProfile = await incrementMonthlyRefinementCount(authUserId)
        if (updatedProfile) profile = updatedProfile
      }

      const usageOut = usageEnvelope(profile, authUserEmail)
      const rq = refinementQuotaForResponse(profile, authUserEmail)
      debugLog('[api/ai] refine_section response', { source: 'openai', section: refinePayload.sectionName })
      void logProductEvent(authUserId, 'section_refined', {
        section: refinePayload.sectionName,
        workspace: refinePayload.coachingWorkspace,
      })
      return res.json({
        ok: true,
        refinedText: polished,
        refinedSectionText: polished,
        source: 'openai',
        usedOpenAI: true,
        usageCount: usageOut?.usageCount ?? null,
        remaining: usageOut?.remaining ?? null,
        freeLimit: usageOut?.freeLimit ?? FREE_LIMIT,
        isPro: usageOut?.isPro ?? null,
        refinementUsedThisMonth: rq.refinementUsedThisMonth,
        refinementLimit: rq.refinementLimit,
        refinementRemaining: rq.refinementRemaining,
        refinementUnlimited: rq.refinementUnlimited,
        refinementMonth: profile.refinement_month ?? refinementMonthKeyUtc(),
      })
    } catch (err) {
      const message = typeof err?.message === 'string' ? err.message : 'Refinement failed'
      console.error('[api/ai] refine_section error', message)
      return res.status(500).json({
        ok: false,
        error: message || 'Could not refine this section. Try again.',
      })
    }
  }

  if (action !== 'coaching_log') {
    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` })
  }

  isTutorialRun = payload?.isTutorialRun === true
  payload = sanitizeCoachingPayload(payload)
  if (isTutorialRun) {
    debugLog('[api/ai] coaching_log isTutorialRun (omit from usage; not passed to model)')
  }

  const profileResult = await getProfileForUser(authUserId)
  if (!profileResult.profile || profileResult.error) {
    return res.status(500).json({ ok: false, error: profileResult.error || 'Could not load profile.' })
  }
  const profile = profileResult.profile
  usageSnapshot = usageEnvelope(profile, authUserEmail)
  const hasProAccess = usageSnapshot.isPro
  const freeLimitReached = !hasProAccess && usageSnapshot.usageCount >= FREE_LIMIT
  debugLog('SERVER_API_AI_USAGE_CHECK', {
    userId: authUserId,
    isPro: usageSnapshot.isPro,
    usageCount: usageSnapshot.usageCount,
    freeLimit: FREE_LIMIT,
    remaining: usageSnapshot.remaining,
    freeLimitReached,
    action: 'coaching_log',
  })

  if (!isTutorialRun && freeLimitReached) {
    return res.status(403).json({ ok: false, code: 'FREE_LIMIT_REACHED', error: 'Free limit reached' })
  }

  const rawName = typeof payload?.employeeName === 'string' ? payload.employeeName : ''
  const payloadForAi =
    payload && typeof payload === 'object'
      ? { ...payload, employeeName: formatPersonName(payload.employeeName ?? '') }
      : payload

  const messages = buildCoachingLogMessages('coaching_log', payloadForAi)
  if (!messages) {
    console.error('[api/ai] coaching_log messages missing')
    return res.status(400).json({ ok: false, error: 'Could not build coaching request.' })
  }

  if (!openai) {
    if (action === 'coaching_log') {
      const raw = buildDeterministicCoachingForm(payloadForAi)
      const text = polishGeneratedCoachingForm(raw, rawName)
      debugLog('[api/ai] coaching_log response', {
        source: 'deterministic',
        usedOpenAI: false,
        reason: 'no_openai_key',
        mode: payloadForAi?.mode,
      })
      if (!isTutorialRun && authUserId) {
        const updated = await recordServerSideGenerationUsage(authUserId, authUserEmail)
        if (updated) usageSnapshot = usageEnvelope(updated, authUserEmail)
      }
      trackCoachingGenerated(
        authUserId,
        {
          source: 'deterministic',
          mode: payloadForAi?.mode,
          workspace: payloadForAi?.coachingWorkspace,
        },
        isTutorialRun,
      )
      return res.json({
        ok: true,
        text,
        source: 'deterministic',
        usedOpenAI: false,
        usageCount: usageSnapshot?.usageCount ?? null,
        remaining: usageSnapshot?.remaining ?? null,
        freeLimit: usageSnapshot?.freeLimit ?? FREE_LIMIT,
        isPro: usageSnapshot?.isPro ?? null,
      })
    }
    return res.json({
      ok: false,
      error: 'OpenAI is not configured (missing OPENAI_API_KEY).',
      source: 'error',
      useFallback: true,
    })
  }

  try {
    const chatMessages = [
      { role: 'system', content: messages.system },
      { role: 'user', content: messages.user },
    ]
    let raw = await callOpenAIChatWithOneRetry(chatMessages)

    if (action === 'coaching_log' && messages.coachingMeta) {
      const { issuePrimary, userBlob } = messages.coachingMeta
      let text = polishGeneratedCoachingForm(raw, rawName)
      if (coachingOutputViolatesTopicAnchor(text, issuePrimary, userBlob)) {
        const retryUser = buildTopicRetryUserMessage(issuePrimary, userBlob)
        raw = await callOpenAIChat([
          ...chatMessages,
          { role: 'assistant', content: raw },
          { role: 'user', content: retryUser },
        ])
        text = polishGeneratedCoachingForm(raw, rawName)
      }
      debugLog('[api/ai] coaching_log response', {
        source: 'openai',
        usedOpenAI: true,
        mode: payloadForAi?.mode,
        issuePrimary,
      })
      if (action === 'coaching_log' && !isTutorialRun && authUserId) {
        const updated = await recordServerSideGenerationUsage(authUserId, authUserEmail)
        if (updated) usageSnapshot = usageEnvelope(updated, authUserEmail)
      }
      trackCoachingGenerated(
        authUserId,
        {
          source: 'openai',
          mode: payloadForAi?.mode,
          workspace: payloadForAi?.coachingWorkspace,
        },
        isTutorialRun,
      )
      return res.json({
        ok: true,
        text,
        source: 'openai',
        usedOpenAI: true,
        usageCount: usageSnapshot?.usageCount ?? null,
        remaining: usageSnapshot?.remaining ?? null,
        freeLimit: usageSnapshot?.freeLimit ?? FREE_LIMIT,
        isPro: usageSnapshot?.isPro ?? null,
      })
    }

    const text =
      action === 'coaching_log' ? polishGeneratedCoachingForm(raw, rawName) : raw
    if (action === 'coaching_log') {
      debugLog('[api/ai] coaching_log response', {
        source: 'openai',
        usedOpenAI: true,
        mode: payloadForAi?.mode,
      })
      if (!isTutorialRun && authUserId) {
        const updated = await recordServerSideGenerationUsage(authUserId, authUserEmail)
        if (updated) usageSnapshot = usageEnvelope(updated, authUserEmail)
      }
      trackCoachingGenerated(
        authUserId,
        {
          source: 'openai',
          mode: payloadForAi?.mode,
          workspace: payloadForAi?.coachingWorkspace,
        },
        isTutorialRun,
      )
    }
    return res.json({
      ok: true,
      text,
      source: 'openai',
      usedOpenAI: true,
      usageCount: usageSnapshot?.usageCount ?? null,
      remaining: usageSnapshot?.remaining ?? null,
      freeLimit: usageSnapshot?.freeLimit ?? FREE_LIMIT,
      isPro: usageSnapshot?.isPro ?? null,
    })
  } catch (err) {
    const code = err.code || 'UNKNOWN'
    const message = err.message || 'AI request failed'
    if (code !== 'NO_KEY') {
      console.error('[api/ai]', code, message)
    }
    if (action === 'coaching_log') {
      const raw = buildDeterministicCoachingForm(payloadForAi)
      const text = polishGeneratedCoachingForm(raw, rawName)
      debugLog('[api/ai] coaching_log response', {
        source: 'deterministic',
        usedOpenAI: false,
        reason: 'openai_error',
        mode: payloadForAi?.mode,
        error: message,
      })
      if (!isTutorialRun && authUserId) {
        const updated = await recordServerSideGenerationUsage(authUserId, authUserEmail)
        if (updated) usageSnapshot = usageEnvelope(updated, authUserEmail)
      }
      trackCoachingGenerated(
        authUserId,
        {
          source: 'deterministic',
          mode: payloadForAi?.mode,
          workspace: payloadForAi?.coachingWorkspace,
          fallbackReason: 'openai_error',
        },
        isTutorialRun,
      )
      return res.json({
        ok: true,
        text,
        source: 'deterministic',
        usedOpenAI: false,
        error: message,
        usageCount: usageSnapshot?.usageCount ?? null,
        remaining: usageSnapshot?.remaining ?? null,
        freeLimit: usageSnapshot?.freeLimit ?? FREE_LIMIT,
        isPro: usageSnapshot?.isPro ?? null,
      })
    }
    return res.json({
      ok: false,
      error: message,
      source: 'error',
      useFallback: true,
    })
  }
})

if (hasFrontendBuild) {
  const absDist = path.resolve(distDir)
  const absIndex = path.resolve(indexHtmlPath)
  app.use(express.static(absDist, { fallthrough: true }))
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    if (req.path.startsWith('/api') || req.path.startsWith('/webhook')) {
      return res.status(404).type('text').send('Not found')
    }
    res.sendFile(absIndex, (err) => {
      if (err) next(err)
    })
  })
} else {
  console.warn(
    '[static] No built frontend found. Tried FRONTEND_DIST,',
    path.resolve(__dirname, '..', 'dist'),
    'and',
    path.resolve(process.cwd(), 'dist'),
    '— run `npm run build` or set FRONTEND_DIST to the folder containing index.html.',
  )
  app.get('/', (_req, res) => {
    res
      .status(503)
      .type('text')
      .send(
        'Frontend is not built. Run `npm run build` and redeploy, or set FRONTEND_DIST to your Vite dist folder.',
      )
  })
}

export { app }

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const PORT = process.env.PORT || 3001
  const HOST = '0.0.0.0'

  await setupSentryExpress(app)

  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`)
    if (hasFrontendBuild) {
      console.log('[static] Serving SPA and static files from', path.resolve(distDir))
    }
  })
}
 