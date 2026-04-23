import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import OpenAI from 'openai'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { formatPersonName, polishGeneratedCoachingForm } from '../shared/coachingOutput.mjs'
import {
  buildCoachingClassRules,
  buildDeterministicCoachingForm,
  classifyIssue,
  normalizeIssueText,
} from '../shared/coachingIssueClassifier.mjs'
import { sanitizeCoachingPayload } from '../shared/sanitizeCoachingPayload.mjs'
import {
  buildTopicRetryUserMessage,
  coachingOutputViolatesTopicAnchor,
} from '../shared/coachingTopicValidation.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envFilePath = path.resolve(__dirname, '..', '.env')
dotenv.config({ path: envFilePath, override: true })

console.log('ENV PATH:', process.cwd())
console.log('ENV FILE (resolved):', envFilePath)
console.log('ENV FILE EXISTS:', fs.existsSync(envFilePath))
console.log('OpenAI Key Loaded:', !!process.env.OPENAI_API_KEY)

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || ''
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null

const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim() || ''
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null
const stripePriceId =
  process.env.STRIPE_PRICE_ID?.trim() ||
  process.env.STRIPE_PRO_PRICE_ID?.trim() ||
  'price_1TJaIIHG6iuq9JCNXyc4I5Hb'

const supabaseUrl = process.env.SUPABASE_URL?.trim() || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''
const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null

const PRO_PLAN_STATUSES = new Set(['active', 'trialing'])
const FORCE_DISABLE_STATUSES = new Set(['unpaid', 'incomplete_expired'])
const GRACE_STATUSES = new Set(['past_due', 'incomplete'])

/**
 * @param {number | null} unixSeconds
 * @returns {string | null}
 */
function toIsoFromUnixSeconds(unixSeconds) {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return null
  return new Date(unixSeconds * 1000).toISOString()
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function pickStripeId(value) {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value && 'id' in value && typeof value.id === 'string') {
    return value.id
  }
  return null
}

/**
 * @param {Stripe.Subscription} subscription
 * @returns {{
 *   isPro: boolean
 *   reason: string
 *   subscriptionStatus: string | null
 *   currentPeriodEndIso: string | null
 * }}
 */
function evaluateSubscriptionAccess(subscription) {
  const status = typeof subscription.status === 'string' ? subscription.status : null
  const currentPeriodEndUnix =
    typeof subscription.current_period_end === 'number' ? subscription.current_period_end : null
  const currentPeriodEndIso = toIsoFromUnixSeconds(currentPeriodEndUnix)
  const nowUnix = Math.floor(Date.now() / 1000)
  const periodActive = Number.isFinite(currentPeriodEndUnix) && currentPeriodEndUnix > nowUnix
  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end)

  if (status && FORCE_DISABLE_STATUSES.has(status)) {
    return {
      isPro: false,
      reason: `status_${status}`,
      subscriptionStatus: status,
      currentPeriodEndIso,
    }
  }

  if (status && PRO_PLAN_STATUSES.has(status)) {
    return {
      isPro: true,
      reason: `status_${status}`,
      subscriptionStatus: status,
      currentPeriodEndIso,
    }
  }

  if (cancelAtPeriodEnd && periodActive) {
    return {
      isPro: true,
      reason: 'cancel_at_period_end_period_active',
      subscriptionStatus: status,
      currentPeriodEndIso,
    }
  }

  if (status && GRACE_STATUSES.has(status) && periodActive) {
    return {
      isPro: true,
      reason: `grace_${status}_period_active`,
      subscriptionStatus: status,
      currentPeriodEndIso,
    }
  }

  return {
    isPro: false,
    reason: periodActive ? 'status_not_pro' : 'period_ended_or_missing',
    subscriptionStatus: status,
    currentPeriodEndIso,
  }
}

/**
 * @param {string} customerId
 * @param {string | null} subscriptionId
 * @param {string | null} metadataUserId
 * @returns {Promise<string | null>}
 */
async function resolveProfileIdForBilling(customerId, subscriptionId, metadataUserId) {
  const candidateId = typeof metadataUserId === 'string' ? metadataUserId.trim() : ''
  if (candidateId) return candidateId
  if (!supabaseAdmin) return null

  if (subscriptionId) {
    const { data: bySub, error: bySubError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle()
    if (bySubError) {
      console.error('[billing-sync] profile lookup by subscription failed:', bySubError.message)
    } else if (bySub?.id) {
      return String(bySub.id)
    }
  }

  const { data: byCustomer, error: byCustomerError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  if (byCustomerError) {
    console.error('[billing-sync] profile lookup by customer failed:', byCustomerError.message)
    return null
  }
  return byCustomer?.id ? String(byCustomer.id) : null
}

/**
 * @param {{
 *   eventType: string
 *   customerId: string
 *   subscription: Stripe.Subscription
 *   metadataUserId: string | null
 * }} params
 */
async function syncSubscriptionToUser(params) {
  const { eventType, customerId, subscription, metadataUserId } = params
  const subscriptionId = pickStripeId(subscription.id)
  const profileId = await resolveProfileIdForBilling(customerId, subscriptionId, metadataUserId)
  const access = evaluateSubscriptionAccess(subscription)

  console.log('[billing-sync] event:', eventType)
  console.log('[billing-sync] customer id:', customerId)
  console.log('[billing-sync] subscription id:', subscriptionId ?? '(none)')
  console.log('[billing-sync] profile id:', profileId ?? '(unresolved)')
  console.log('[billing-sync] decision:', {
    is_pro: access.isPro,
    reason: access.reason,
    subscription_status: access.subscriptionStatus,
    current_period_end: access.currentPeriodEndIso,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
  })

  if (!supabaseAdmin) {
    console.error('[billing-sync] Supabase admin is not configured')
    return { ok: false, skipped: 'no_supabase_admin' }
  }
  if (!profileId) {
    console.error('[billing-sync] Could not resolve profile id for billing event')
    return { ok: false, skipped: 'profile_not_found' }
  }

  const updatePayload = {
    is_pro: access.isPro,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    subscription_status: access.subscriptionStatus,
    current_period_end: access.currentPeriodEndIso,
    plan: access.isPro ? 'pro' : 'free',
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(updatePayload)
    .eq('id', profileId)
    .select('id')

  if (error) {
    console.error('[billing-sync] Supabase update failed:', error.message)
    return { ok: false, skipped: 'supabase_error', error: error.message }
  }
  if (!data?.length) {
    console.error('[billing-sync] Supabase update matched no rows for profile:', profileId)
    return { ok: false, skipped: 'no_row_updated' }
  }

  return { ok: true, profileId, updatePayload }
}

const SECTION_SHAPE = [
  'Pre-Coaching Notes:',
  '…',
  '',
  'Coaching Category:',
  '…',
  '',
  'Situation:',
  '…',
  '',
  'Behavior:',
  '…',
  '',
  'Impact:',
  '…',
  '',
  'Next Steps:',
  '…',
  '',
  'Manager Follow-Up:',
  '…',
].join('\n')

/** Corrective coaching — natural prose, anchored to user input; topic guide appended per request. */
const COACHING_PROMPT =
  'You are an experienced team lead writing a CORRECTIVE COACHING form (mode coaching only).\n\n' +
  'VOICE:\n' +
  '- Write like a real manager speaking to the employee: professional, direct, slightly conversational.\n' +
  '- Prefer first-person framing where it fits (e.g., "I want to discuss...", "I expect...", "We need to see...").\n' +
  '- Avoid robotic language and generic evaluation phrases.\n\n' +
  'STAY ON TOPIC:\n' +
  '- Anchor everything to coachingReason and notes from the JSON. You may rephrase and polish so it reads professional and natural—like a real manager, not a stiff template.\n' +
  '- You may add closely related workplace context (expectations, standards, accountability, why it matters) as long as it clearly belongs to the SAME topic the user entered.\n' +
  '- Do not invent a different problem. Do not bring in customers, incidents, numbers, dates, or details the user did not imply.\n' +
  '- Do not mention sales, goals, metrics, offers, accessories, customer engagement, or closing unless the input is actually about sales or performance.\n' +
  '- Do not mention attendance, punctuality, breaks, or schedule unless the input is about attendance.\n' +
  '- Do not mention keys, vault, safe handling, security, or policy compliance unless the input is about security or policy.\n\n' +
  'TOPIC_HINT in the system message is only to nudge Coaching Category and tone—it is not extra content to paste. Every section must still reflect the user’s actual words.\n\n' +
  'EXAMPLES (boundaries—not wording to copy):\n' +
  '- Input: "Left keys unattended" → You may expand into key control, security expectations, accountability, and following procedure. Do NOT add goals, sales, missed sales, customer engagement, or store performance.\n' +
  '- Input: "Late returning from lunch" → You may expand into punctuality, schedule adherence, and team expectations. Do NOT add key/security issues or sales metrics.\n' +
  '- Input: "Missed accessory offers" → You may expand into sales execution, consistency with offers, and expectations tied to that. Do NOT add keys, vault, or attendance problems.\n\n' +
  'OUTPUT SHAPE:\n' +
  '- Exact section titles and order below. Plain text, paste-ready. No ## markdown or bold titles.\n\n' +
  'LENGTH:\n' +
  '- Prose: 1–2 short sentences per section; Behavior at most 2 sentences.\n' +
  '- Next Steps: 2–3 bullets.\n\n' +
  'NUMBERS / KPIs:\n' +
  '- If the user gave numbers, use them directly and specifically (example shape: "You recorded X while goal was Y").\n' +
  '- If numbers are present, keep them grounded to the actual input and do not invent additional metrics.\n\n' +
  'ACCOUNTABILITY (required):\n' +
  '- Clearly state what happened, what was expected, and what needs to change.\n' +
  '- Include a direct expectation statement in Next Steps and/or Manager Follow-Up (example shape: "Going forward, I expect...").\n\n' +
  'AVOID these vague phrases:\n' +
  '- "indicates a need for improvement"\n' +
  '- "below expectations"\n' +
  '- "focus on improvement"\n' +
  'Use explicit language instead: what happened, expected standard, required change.\n\n' +
  'AVOID stiff corporate phrasing ("leverage," "moving forward," "align on expectations," long essay tone). Sound direct and human.\n\n' +
  'SENTENCES: Title-case employeeName from JSON; bullet lines start with a capital letter. Complete sentences only.\n\n' +
  'SECTIONS — exact titles, this order. Nothing before "Pre-Coaching Notes:":\n' +
  'Pre-Coaching Notes:\n' +
  'Coaching Category:\n' +
  'Situation:\n' +
  'Behavior:\n' +
  'Impact:\n' +
  'Next Steps:\n' +
  'Manager Follow-Up:\n\n' +
  'SECTION GUIDANCE:\n' +
  'Pre-Coaching Notes: Open with the employee’s name; frame the issue clearly from their input. If numbers/goal context exists, put the specific actual vs expected here.\n' +
  'Coaching Category: One natural line aligned with the topic they raised.\n' +
  'Situation: State what happened in plain manager language, tied to the input.\n' +
  'Behavior: State the observed behavior and the expected behavior/standard.\n' +
  'Impact: Explain concrete impact tied to the same issue (no unrelated domains).\n' +
  'Next Steps: Practical, actionable bullets tied directly to the issue and expectation.\n' +
  'Manager Follow-Up: Include timing and a direct expectation statement ("I expect...").\n\n' +
  'Layout example:\n' +
  SECTION_SHAPE

/**
 * Recognition-only system prompt. Zero overlap with COACHING_PROMPT — different role, rules, and vocabulary.
 */
const RECOGNITION_PROMPT =
  'You are writing a RECOGNITION form only (mode recognition). This is NOT coaching.\n\n' +
  'GROUNDING:\n' +
  '- Praise only what appears in coachingReason and notes. Do not invent customers, numbers, rankings, or scenarios.\n' +
  '- Do not mention sales, goals, metrics, engagement, closing, or offers unless the user explicitly wrote those topics—then you may reflect their words only.\n' +
  '- If input is short, keep recognition sincere and compact—no generic "store performance" claims unless the user implied them.\n\n' +
  'Rules:\n' +
  '- 100% positive reinforcement tied to the stated behavior.\n' +
  '- No gaps, no "below goal," no corrective mandates.\n\n' +
  'Next Steps: continue / maintain / build on strengths / lead by example—word bullets to match what the user actually praised.\n\n' +
  'Manager Follow-Up: supportive only (e.g. continue to encourage and check in). No accountability for failure.\n\n' +
  'LENGTH: 1–2 short sentences per section; Next Steps 2–3 bullets.\n' +
  'SENTENCES: Title-case employeeName from JSON; bullets start with a capital letter.\n\n' +
  'OUTPUT STRUCTURE — exact section titles in this order:\n' +
  'Pre-Coaching Notes:\n' +
  'Coaching Category:\n' +
  'Situation:\n' +
  'Behavior:\n' +
  'Impact:\n' +
  'Next Steps:\n' +
  'Manager Follow-Up:\n\n' +
  'Layout example:\n' +
  SECTION_SHAPE

const COACHING_USER_PREFIX =
  'TASK: Write the full coaching form. Sound natural and polished, but stay on the issue in coachingReason/notes.\n' +
  'Use ISSUE_TOPIC_HINT and the TOPIC GUIDE in the system message for category/tone only—do not drift into unrelated themes.\n' +
  'If numbers exist in the JSON, mention actual vs expected clearly; never invent KPIs.\n' +
  'Include clear accountability language: what happened, what was expected, and what needs to change.\n\n'

const RECOGNITION_USER_PREFIX =
  'TASK: Recognition form only. 100% positive reinforcement. You are NOT writing coaching.\n' +
  'Celebrate only what appears in coachingReason and notes—no invented customers, metrics, or sales stories.\n' +
  'Next Steps: continue / maintain / build on strengths—word bullets to match the user’s praise.\n' +
  'Manager Follow-Up: supportive check-in only; no deficit framing.\n' +
  'Use employeeName from JSON for the rep’s name.\n\n'

/**
 * @param {Array<{ role: string; content: string }>} chatMessages
 * @returns {Promise<string>}
 */
async function callOpenAIChat(chatMessages) {
  if (!openai) {
    const err = new Error('OpenAI is not configured (missing OPENAI_API_KEY).')
    err.code = 'NO_KEY'
    throw err
  }

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: chatMessages,
      temperature: 0.52,
      max_tokens: 1300,
    })

    const text = completion.choices[0]?.message?.content?.trim()
    if (!text) {
      const err = new Error('Empty response from the model.')
      err.code = 'EMPTY_RESPONSE'
      throw err
    }
    return text
  } catch (e) {
    if (e && typeof e === 'object' && e.code === 'NO_KEY') throw e
    if (e && typeof e === 'object' && e.code === 'EMPTY_RESPONSE') throw e
    const msg =
      typeof e?.message === 'string' ? e.message : 'OpenAI request failed'
    const err = new Error(msg)
    err.code = 'OPENAI_HTTP'
    err.status = e?.status
    throw err
  }
}

/**
 * One immediate retry on transient OpenAI failures before caller falls back to deterministic output.
 * @param {Array<{ role: string; content: string }>} chatMessages
 */
async function callOpenAIChatWithOneRetry(chatMessages) {
  try {
    return await callOpenAIChat(chatMessages)
  } catch (e) {
    if (e && typeof e === 'object' && e.code === 'NO_KEY') throw e
    console.warn('[api/ai] OpenAI call failed, retrying once:', e?.message)
    return await callOpenAIChat(chatMessages)
  }
}

/**
 * Coaching and recognition use two entirely separate system prompts and user preambles — no shared template.
 * @param {string} action
 * @param {object} payload
 * @returns {null | { system: string; user: string; coachingMeta: null | { issuePrimary: string; userBlob: string } }}
 */
function buildCoachingLogMessages(action, payload) {
  if (action !== 'coaching_log') return null
  const mode = payload?.mode === 'recognition' ? 'recognition' : 'coaching'

  const blob = normalizeIssueText(`${payload?.coachingReason ?? ''} ${payload?.notes ?? ''}`)
  const { primary: issuePrimary } = classifyIssue(blob, mode)
  const topicGuide = buildCoachingClassRules(issuePrimary, mode)

  let systemPrompt
  if (mode === 'recognition') {
    systemPrompt = `${RECOGNITION_PROMPT}\n\nTOPIC GUIDE:\n${topicGuide}`
  } else {
    systemPrompt = `${COACHING_PROMPT}\n\nTOPIC GUIDE (tone and boundaries—not a template to paste):\n${topicGuide}`
  }

  let userPreamble
  if (mode === 'recognition') {
    userPreamble = RECOGNITION_USER_PREFIX
  } else {
    userPreamble = COACHING_USER_PREFIX
  }

  const body = JSON.stringify(payload ?? {}, null, 2)
  const user =
    userPreamble +
    (mode === 'coaching'
      ? `ISSUE_TOPIC_HINT (for category/tone only; content must come from JSON): ${issuePrimary}\n`
      : '') +
    'Copy-paste clean plain text. No fragments or cut-off endings.\n\n' +
    `JSON:\n${body}`

  return {
    system: systemPrompt,
    user,
    coachingMeta:
      mode === 'coaching' ? { issuePrimary, userBlob: blob } : null,
  }
}

const app = express()

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

  console.log('[webhook/stripe] event type:', event.type)

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const customerId = pickStripeId(session.customer)
      const subscriptionId = pickStripeId(session.subscription)
      const metadataUserId =
        session.metadata && typeof session.metadata.userId === 'string'
          ? session.metadata.userId
          : null

      console.log('[webhook/stripe] checkout session id:', session.id)
      console.log('[webhook/stripe] checkout metadata.userId:', metadataUserId ?? '(missing)')

      if (!customerId || !subscriptionId) {
        console.error(
          '[webhook/stripe] checkout.session.completed missing customer or subscription id; skipping sync',
        )
        return res.status(200).json({ received: true, skipped: 'missing_customer_or_subscription' })
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const result = await syncSubscriptionToUser({
        eventType: event.type,
        customerId,
        subscription,
        metadataUserId,
      })
      return res.status(200).json({ received: true, result })
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object
      const customerId = pickStripeId(subscription.customer)
      if (!customerId) {
        console.error('[webhook/stripe] subscription event missing customer id')
        return res.status(200).json({ received: true, skipped: 'missing_customer_id' })
      }

      const result = await syncSubscriptionToUser({
        eventType: event.type,
        customerId,
        subscription,
        metadataUserId: null,
      })
      return res.status(200).json({ received: true, result })
    }

    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const invoice = event.data.object
      const customerId = pickStripeId(invoice.customer)
      const subscriptionId = pickStripeId(invoice.subscription)
      if (!customerId || !subscriptionId) {
        console.error('[webhook/stripe] invoice event missing customer or subscription id')
        return res.status(200).json({ received: true, skipped: 'missing_customer_or_subscription' })
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const result = await syncSubscriptionToUser({
        eventType: event.type,
        customerId,
        subscription,
        metadataUserId: null,
      })
      return res.status(200).json({ received: true, result })
    }
  } catch (err) {
    const message = typeof err?.message === 'string' ? err.message : 'webhook handling failed'
    console.error('[webhook/stripe] Handler error:', message)
    return res.status(200).json({ received: true, handlerError: message })
  }

  return res.status(200).json({ received: true })
})

app.use(cors({ origin: true }))
app.use(express.json({ limit: '256kb' }))

/**
 * @param {import('express').Request} req
 * @returns {Promise<{ userId: string | null; error: string | null }>}
 */
async function getAuthenticatedUserId(req) {
  if (!supabaseAdmin) {
    return { userId: null, error: 'Database is not configured.' }
  }

  const authHeader = req.headers.authorization
  const bearerPrefix = 'Bearer '
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith(bearerPrefix)) {
    return { userId: null, error: 'Missing or invalid authorization header.' }
  }

  const token = authHeader.slice(bearerPrefix.length).trim()
  if (!token) {
    return { userId: null, error: 'Missing access token.' }
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user?.id) {
    return { userId: null, error: 'Could not verify user session.' }
  }

  return { userId: String(data.user.id), error: null }
}

app.post('/create-checkout-session', async (req, res) => {
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

  const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : ''
  const emailMeta = typeof req.body?.email === 'string' ? req.body.email.trim() : ''
  if (!userId) {
    return res.status(400).json({ error: 'userId is required in JSON body.' })
  }

  const checkoutMetadata = { userId, ...(emailMeta ? { email: emailMeta } : {}) }
  console.log('[create-checkout-session] checkout metadata (safe):', {
    userId,
    emailAttached: Boolean(emailMeta),
  })

  try {
    console.log('[create-checkout-session] Stripe price id:', stripePriceId)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}`,
      metadata: checkoutMetadata,
      client_reference_id: userId,
    })
    if (!session.url) {
      return res.status(500).json({ error: 'Checkout session missing URL.' })
    }
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

app.post('/api/create-customer-portal-session', handleCreateCustomerPortalSession)
app.post('/create-billing-portal-session', handleCreateCustomerPortalSession)

app.post('/api/ai', async (req, res) => {
  const action = req.body?.action
  let payload = req.body?.payload
  if (!action || typeof action !== 'string' || !payload || typeof payload !== 'object') {
    console.error('[api/ai] bad request: expected { action, payload }')
    return res.status(400).json({ ok: false, error: 'Expected { action, payload }.' })
  }

  if (action === 'coaching_log') {
    payload = { ...payload, ...sanitizeCoachingPayload(payload) }
  }

  const rawName =
    action === 'coaching_log' && typeof payload?.employeeName === 'string'
      ? payload.employeeName
      : ''
  const payloadForAi =
    action === 'coaching_log' && payload && typeof payload === 'object'
      ? { ...payload, employeeName: formatPersonName(payload.employeeName ?? '') }
      : payload

  // OpenAI: mode "recognition" → RECOGNITION_PROMPT; otherwise → COACHING_PROMPT (fully separate templates).
  const messages = buildCoachingLogMessages(action, payloadForAi)
  if (!messages) {
    console.error('[api/ai] unknown action:', action)
    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` })
  }

  if (!openai) {
    if (action === 'coaching_log') {
      const raw = buildDeterministicCoachingForm(payloadForAi)
      const text = polishGeneratedCoachingForm(raw, rawName)
      console.log('[api/ai] coaching_log response', {
        source: 'deterministic',
        usedOpenAI: false,
        reason: 'no_openai_key',
        mode: payloadForAi?.mode,
      })
      return res.json({ ok: true, text, source: 'deterministic', usedOpenAI: false })
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
      console.log('[api/ai] coaching_log response', {
        source: 'openai',
        usedOpenAI: true,
        mode: payloadForAi?.mode,
        issuePrimary,
      })
      return res.json({ ok: true, text, source: 'openai', usedOpenAI: true })
    }

    const text =
      action === 'coaching_log' ? polishGeneratedCoachingForm(raw, rawName) : raw
    if (action === 'coaching_log') {
      console.log('[api/ai] coaching_log response', {
        source: 'openai',
        usedOpenAI: true,
        mode: payloadForAi?.mode,
      })
    }
    return res.json({
      ok: true,
      text,
      source: 'openai',
      usedOpenAI: true,
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
      console.log('[api/ai] coaching_log response', {
        source: 'deterministic',
        usedOpenAI: false,
        reason: 'openai_error',
        mode: payloadForAi?.mode,
        error: message,
      })
      return res.json({
        ok: true,
        text,
        source: 'deterministic',
        usedOpenAI: false,
        error: message,
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

const PORT = process.env.PORT || 3001
const HOST = '0.0.0.0'

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`)
  if (hasFrontendBuild) {
    console.log('[static] Serving SPA and static files from', path.resolve(distDir))
  }
})
 