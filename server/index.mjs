import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'
import rateLimit from 'express-rate-limit'
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
import { isLightReminderCoaching } from '../shared/coachingReminderTone.mjs'
import { sanitizeCoachingPayload } from '../shared/sanitizeCoachingPayload.mjs'
import {
  buildTopicRetryUserMessage,
  coachingOutputViolatesTopicAnchor,
} from '../shared/coachingTopicValidation.mjs'
import { evaluateSubscriptionAccess, profileRowGrantsPremium } from '../shared/billingSubscription.mjs'
import { effectivePremiumAccess } from '../shared/ownerFreePro.mjs'
import { resyncAllProfilesFromStripe } from '../shared/resyncStripeProfiles.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envFilePath = path.resolve(__dirname, '..', '.env')
dotenv.config({ path: envFilePath, override: true })

const debugLog = (...args) => {
  if (process.env.NODE_ENV !== 'production') console.log(...args)
}

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || ''
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null

const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim() || ''
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null
const FREE_LIMIT = Number.parseInt(process.env.FREE_LIMIT || '3', 10)
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

/** In-memory cooldown so login reconcile does not hammer Stripe. */
const billingReconcileCooldown = new Map()
const BILLING_RECONCILE_COOLDOWN_MS = 5 * 60 * 1000

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
    console.error('[billing-sync] Supabase update FAILED', {
      eventType,
      profileId,
      message: error.message,
      code: error.code ?? null,
    })
    return { ok: false, skipped: 'supabase_error', error: error.message }
  }
  if (!data?.length) {
    console.error('[billing-sync] Supabase update matched NO ROWS', { eventType, profileId })
    return { ok: false, skipped: 'no_row_updated' }
  }

  console.log('[billing-sync] Supabase OK — subscription state synced', {
    eventType,
    profileId,
    is_pro: updatePayload.is_pro,
    subscription_status: updatePayload.subscription_status,
    current_period_end: updatePayload.current_period_end,
    plan: updatePayload.plan,
  })
  return { ok: true, profileId, updatePayload }
}

/**
 * Pull latest subscription from Stripe and sync to profiles (backup if webhooks lag).
 * @param {string} userId
 * @param {{ force?: boolean }} [opts]
 */
async function reconcileStripeSubscriptionForUser(userId, opts = {}) {
  if (!stripe || !supabaseAdmin) {
    return { ok: false, skipped: 'not_configured' }
  }
  const now = Date.now()
  if (!opts.force) {
    const last = billingReconcileCooldown.get(userId) ?? 0
    if (now - last < BILLING_RECONCILE_COOLDOWN_MS) {
      console.log('[billing-reconcile] cooldown active, skipping Stripe call for user', userId)
      return { ok: true, skipped: 'cooldown' }
    }
  }
  billingReconcileCooldown.set(userId, now)

  const { data: row, error } = await supabaseAdmin
    .from('profiles')
    .select('stripe_subscription_id, stripe_customer_id')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('[billing-reconcile] profile load failed:', error.message)
    return { ok: false, skipped: 'profile_load_error', error: error.message }
  }
  if (!row) {
    console.warn('[billing-reconcile] no profile row', userId)
    return { ok: false, skipped: 'no_profile' }
  }

  let subscriptionId =
    row.stripe_subscription_id && typeof row.stripe_subscription_id === 'string'
      ? row.stripe_subscription_id.trim()
      : ''
  const customerIdRaw =
    row.stripe_customer_id && typeof row.stripe_customer_id === 'string' ? row.stripe_customer_id.trim() : ''

  if (!subscriptionId && customerIdRaw) {
    try {
      const list = await stripe.subscriptions.list({
        customer: customerIdRaw,
        status: 'all',
        limit: 10,
      })
      const prefer = ['active', 'trialing', 'past_due', 'unpaid', 'canceled', 'incomplete']
      for (const st of prefer) {
        const hit = list.data.find((s) => s.status === st)
        if (hit?.id) {
          subscriptionId = hit.id
          break
        }
      }
    } catch (e) {
      const msg = typeof e?.message === 'string' ? e.message : 'list failed'
      console.error('[billing-reconcile] subscription list failed:', msg)
      return { ok: false, skipped: 'stripe_list_error', error: msg }
    }
  }

  if (!subscriptionId) {
    console.log('[billing-reconcile] no subscription to reconcile', userId)
    return { ok: true, skipped: 'no_stripe_subscription' }
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const customerId = pickStripeId(subscription.customer) || customerIdRaw
    if (!customerId) {
      console.error('[billing-reconcile] missing customer on subscription', subscriptionId)
      return { ok: false, skipped: 'missing_customer' }
    }
    console.log('[billing-reconcile] syncing from Stripe API', { userId, subscriptionId })
    return syncSubscriptionToUser({
      eventType: 'billing.reconcile',
      customerId,
      subscription,
      metadataUserId: userId,
    })
  } catch (e) {
    const msg = typeof e?.message === 'string' ? e.message : 'retrieve failed'
    console.error('[billing-reconcile] Stripe retrieve failed:', { userId, subscriptionId, message: msg })
    return { ok: false, skipped: 'stripe_retrieve_error', error: msg }
  }
}

/**
 * @param {import('express').Response} res
 * @param {string} eventType
 * @param {Awaited<ReturnType<typeof syncSubscriptionToUser>>} result
 */
function respondStripeWebhookSync(res, eventType, result) {
  if (!result.ok && result.skipped === 'profile_not_found') {
    console.warn('[webhook/stripe] sync skipped (profile not found) — may be race before checkout metadata', {
      eventType,
    })
    return res.status(200).json({ received: true, result })
  }
  if (!result.ok && (result.skipped === 'no_supabase_admin' || result.skipped === 'not_configured')) {
    console.error('[webhook/stripe] sync failed — server misconfiguration', { eventType, result })
    return res.status(503).json({ received: false, result })
  }
  if (!result.ok) {
    console.error('[webhook/stripe] sync FAILED — returning 500 so Stripe retries', { eventType, result })
    return res.status(500).json({ received: false, result })
  }
  console.log('[webhook/stripe] sync success', { eventType, profileId: result.profileId })
  return res.status(200).json({ received: true, result })
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

/** Strict ordering for the model — placed first in the coaching system prompt. */
const COACHING_PRIORITY =
  'PRIORITY:\n' +
  '1. Use only the provided input (coachingReason and notes—metrics and/or scenario).\n' +
  '2. Apply APS / HPA / MPT definitions ONLY when those metrics appear in the input.\n' +
  '3. Do not mix unrelated topics or domains.\n' +
  '4. Keep the WHOLE form noticeably shorter than typical HR coaching: target ~35–40% less total wording—brief sections, no filler, no repeating the same facts.\n' +
  '5. Avoid generic or corporate filler language; do not invent KPIs or numbers.\n' +
  '6. The notes field (when present) strongly influences tone and severity: reminders, “not serious,” “light coaching,” or “no break schedule” → much softer, conversational, zero write-up tone.\n\n'

const COACHING_NATURAL_VOICE =
  'NATURAL TEAM LEAD VOICE (not corporate HR, not AI-polished):\n' +
  '- Sound like a real Team Lead on the floor: plain words, short sentences, how people actually talk.\n' +
  '- Do NOT repeat the same concrete details (break counts, times, metric numbers) in every section—state specifics once in Pre-Coaching Notes and/or Situation, then use short references (“that timing,” “what we talked about”) in Behavior / Impact / Next Steps.\n' +
  '- Never restate the full issue three or four times with different buzzwords.\n\n' +
  'STRICTLY DO NOT USE (or close paraphrases):\n' +
  '- maintain team coverage, consistent rhythm on the floor, moving forward, monitor this lightly, adhere to expectations, compliance, ensure alignment, performance improvement plan, mitigate, operational excellence, cascade.\n\n' +
  'Lean on simple language instead (pick a few that fit; do not stuff every phrase into one document):\n' +
  '- just wanted to mention, wanted to bring it up, keep an eye on, try to, all good just make sure, let’s keep it cleaned up, quick heads-up, nothing crazy.\n\n' +
  'TONE VARIATION:\n' +
  '- Not every coaching should match the same cadence. Sometimes keep it very short; sometimes a touch more conversational; sometimes more direct—still human.\n' +
  '- Vary how sections open so outputs do not all read like the same template.\n\n'

/** Corrective coaching — natural prose, anchored to user input; topic guide appended per request. */
const RETAIL_WIRELESS_METRIC_DEFINITIONS =
  'RETAIL WIRELESS METRICS — use EXACTLY these definitions whenever coachingReason or notes mention APS, HPA, MPT, or performance on the sales floor. Never substitute other industry meanings (e.g. do not treat APS as “accessories per sale” or anything not defined below).\n' +
  '- APS (Attempts Per Shift): how many customers the rep gets to the tablet to check eligibility (AT&T, Verizon, T-Mobile). Low APS means the rep is not creating enough real attempts.\n' +
  '- HPA (Hours Per Activation): how many hours pass between successful postpaid activations/sales. Lower HPA is better. High HPA means the rep is going too long between closed activations.\n' +
  '- MPT (Minutes Per Transaction): the time between customer interactions/transactions. It does NOT mean how fast the rep completes one customer transaction. High MPT means too much downtime between customer opportunities.\n' +
  'INTERPRETATION (only when the user’s input supports it; never invent numbers):\n' +
  '- Low APS → not enough engagement / not enough genuine attempts to eligibility.\n' +
  '- High HPA → too long between postpaid wins / not closing often enough.\n' +
  '- High MPT → gaps between touches on the floor / not cycling to the next opportunity quickly enough.\n' +
  'Only use APS, HPA, and MPT values that appear in the JSON. Never guess labels, goals, or KPIs.\n\n'

const COACHING_SCENARIO_VS_METRICS =
  'ROLE: You are a Team Lead coaching a Mobile Expert in a retail wireless store.\n' +
  'The user may give performance metrics (APS, HPA, MPT), OR a behavioral scenario (lateness, poor engagement, misuse of keys, uniform, conduct, etc.), OR both—follow what is actually in coachingReason and notes.\n\n' +
  'IF THE INPUT IS PRIMARILY METRICS (APS / HPA / MPT):\n' +
  '- Use the metric definitions above exactly—never reinterpret those acronyms.\n' +
  '- Tie behavior to results in plain language—only what the input supports.\n\n' +
  'IF THE INPUT IS PRIMARILY A SCENARIO (not a metrics story):\n' +
  '- Address it straight. Firm when needed, still conversational—not a policy memo.\n' +
  '- Say why it matters in one simple beat if Impact needs it.\n\n' +
  'ALWAYS: Follow PRIORITY and NATURAL TEAM LEAD VOICE. Short and real.\n\n'

const COACHING_BUSINESS_OUTCOMES =
  'BUSINESS OUTCOMES — when coachingReason/notes are about selling or floor performance (metrics like APS/HPA/MPT, goals, activations, accessories, conversion, customer engagement for sales, or similar):\n' +
  '- Impact in one or two plain sentences: how it shows up for customers or the shift—without stacked buzzwords or repeating metrics already stated above.\n' +
  '- Keep fixes grounded in what the user wrote; no invented quotas or rankings.\n\n' +
  'When the topic is NOT about selling or performance (e.g. keys/security or attendance with no sales angle in the user text), keep Impact short and specific to that lane—do not force sales outcomes.\n\n'

const COACHING_STRUCTURE_AND_TONE =
  'COACHING QUALITY:\n' +
  '- Retail wireless Team Lead → Mobile Expert: human, specific, brief.\n' +
  '- Sections stack without repeating the same story—each section adds something new or sharper.\n\n'

const COACHING_PROMPT =
  COACHING_PRIORITY +
  COACHING_NATURAL_VOICE +
  'You are an experienced retail wireless Team Lead writing a CORRECTIVE COACHING form (mode coaching only).\n' +
  'Default context when it fits the user’s topic: phones, plans, postpaid activations, eligibility checks on the tablet, accessories, store traffic, Mobile Experts on the sales floor — use only what the user’s words imply; never invent KPIs or incidents.\n\n' +
  RETAIL_WIRELESS_METRIC_DEFINITIONS +
  COACHING_SCENARIO_VS_METRICS +
  COACHING_BUSINESS_OUTCOMES +
  COACHING_STRUCTURE_AND_TONE +
  'VOICE & STAY ON TOPIC:\n' +
  '- Conversational Team Lead first—plain talk, not polished HR prose.\n' +
  '- Anchor to coachingReason and notes; add only closely related context for the SAME topic.\n' +
  '- Do not invent problems, customers, incidents, numbers, or details not implied by the user.\n' +
  '- Sales/metrics/engagement/closing only if the input is about sales or performance; attendance only if about attendance; keys/security only if about security or policy.\n\n' +
  'TOPIC_HINT in the system message is only to nudge Coaching Category and tone—it is not extra content to paste. Every section must still reflect the user’s actual words.\n\n' +
  'EXAMPLES (boundaries—not wording to copy):\n' +
  '- Input: "Left keys unattended" → You may expand into key control, security expectations, accountability, and following procedure. Do NOT add goals, sales, missed sales, customer engagement, or store performance.\n' +
  '- Input: "Late returning from lunch" → You may expand into punctuality, schedule adherence, and team expectations. Do NOT add key/security issues or sales metrics.\n' +
  '- Input: "Missed accessory offers" → You may expand into sales execution, consistency with offers, and expectations tied to that. Do NOT add keys, vault, or attendance problems.\n\n' +
  'OUTPUT SHAPE:\n' +
  '- Exact section titles and order below. Plain text, paste-ready. No ## markdown or bold titles.\n\n' +
  'LENGTH:\n' +
  '- Default: ONE tight sentence per section when possible (two only if truly needed). Behavior often one sentence.\n' +
  '- Next Steps: 2–3 very short bullets (a few words each is fine).\n' +
  '- Overall output ~35–40% shorter than a typical formal write-up—trim relentlessly.\n\n' +
  'NUMBERS / KPIs:\n' +
  '- If the user gave numbers, use them directly and specifically (example shape: "You recorded X while goal was Y").\n' +
  '- If numbers are present, keep them grounded to the actual input and do not invent additional metrics.\n\n' +
  'CLEAR EXPECTATIONS (without sounding like HR):\n' +
  '- Say what needs to shift in plain language—short bullets or one simple sentence.\n' +
  '- Prefer “need you to,” “try to,” “let’s keep,” “keep an eye on” over formal mandate tone unless the issue is severe.\n\n' +
  'AVOID these vague AI / HR phrases:\n' +
  '- "indicates a need for improvement", "below expectations", "focus on improvement"\n\n' +
  'Also avoid stiff corporate phrasing ("leverage," "moving forward," "align on expectations").\n\n' +
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
  'Pre-Coaching Notes: Name first; conversational opener optional (“just wanted to mention…”). Put the concrete facts/metrics here OR in Situation—not both in full detail.\n' +
  'Coaching Category: One short natural label.\n' +
  'Situation: Plain facts of what occurred—minimal repetition of Pre-Coaching Notes.\n' +
  'Behavior: What you need from them going forward—often one sentence; no copy-paste of Situation.\n' +
  'Impact: One short beat on why it matters—do not reuse banned phrases or repeat metrics.\n' +
  'Next Steps: Short bullets; each bullet adds a distinct action.\n' +
  'Manager Follow-Up: Brief and human (e.g. quick follow-up, check-in later)—not a second lecture.\n\n' +
  'Layout example:\n' +
  SECTION_SHAPE

/**
 * Recognition-only system prompt. Zero overlap with COACHING_PROMPT — different role, rules, and vocabulary.
 */
const RECOGNITION_PROMPT =
  'PRIORITY:\n' +
  '1. Use only coachingReason and notes.\n' +
  '2. Do not invent praise, numbers, or scenarios.\n' +
  '3. Stay positive and specific—no generic fluff.\n\n' +
  'You are a retail wireless Team Lead writing a RECOGNITION form only (mode recognition). This is NOT coaching.\n' +
  'Use store-appropriate language only when the user’s input clearly fits; never invent sales numbers or customer stories.\n\n' +
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
  'TASK: Write the full coaching form. Stay anchored to coachingReason and notes—human and concise, not polished corporate copy.\n' +
  'Optional notes are authoritative for tone: “just a reminder,” “friendly reminder,” “not a write-up,” “light coaching,” “verbal reminder,” “not serious,” or “no break schedule” → REMINDER_MODE softness (see system message): short, conversational, zero disciplinary / write-up tone.\n' +
  'Decide whether the user is focused on metrics (APS/HPA/MPT) or a behavioral scenario (or both), and follow the matching rules in the system message.\n' +
  'If the topic is about floor performance or selling, connect behavior to outcomes (goals, activations, commission opportunity, gaps between sales) as described under BUSINESS OUTCOMES—without inventing numbers.\n' +
  'If the JSON references APS, HPA, or MPT, use ONLY the retail wireless metric definitions from the system message—do not guess what those letters mean.\n' +
  'Use ISSUE_TOPIC_HINT and the TOPIC GUIDE for category/tone only—do not drift into unrelated themes.\n' +
  'If numbers exist in the JSON, reference them faithfully; never invent goals or extra KPIs.\n' +
  'Problem / why it matters / floor actions must come through in Situation, Impact, and Next Steps as described in the system message. Keep it short and manager-real.\n\n'

/** Appended to system message when REMINDER_MODE applies — overrides conflicting tone rules above. */
const REMINDER_COACHING_MODE =
  'REMINDER_MODE (this request):\n' +
  'The user message includes REMINDER_MODE: true. These instructions OVERRIDE conflicting coaching tone, length, and accountability rules elsewhere in this system message.\n\n' +
  'INTENT:\n' +
  '- Quick heads-up / alignment reminder—NOT a write-up, NOT disciplinary, NOT HR tone.\n' +
  '- Much softer than default coaching: if notes say “not serious” or “light coaching,” keep it casual and brief.\n\n' +
  'If notes include “no break schedule”: do NOT lecture about a rigid break schedule or formal schedule rules—keep guidance general (“keep break timing reasonable,” “watch how breaks fall during the shift”).\n\n' +
  'STRICTLY AVOID (and close variants):\n' +
  '- compliance, policy violation, disciplinary, corrective action, formal investigation, PIP, monitor lightly, maintain team coverage, consistent rhythm on the floor, moving forward, adhere to expectations, ensure alignment.\n' +
  '- “I expect,” “we expect,” “expect to see,” “must comply.”\n\n' +
  'LENGTH:\n' +
  '- Even shorter than normal coaching (see ~35–40% reduction goal). Often ONE sentence per section.\n' +
  '- Say concrete details ONCE (Pre-Coaching Notes or Situation); do not repeat break counts in every section.\n\n' +
  'STYLE EXAMPLE (shape only—use real names/facts from JSON):\n' +
  '- Pre-Coaching Notes: “Name, just wanted to mention [topic]. [facts].”\n' +
  '- Behavior: “Not a huge issue—just try to [simple ask].”\n' +
  '- Impact: one short line on coverage or team flow—plain English.\n' +
  '- Manager Follow-Up: “Just a quick reminder conversation” or similar—minimal.\n\n' +
  'Coaching Category: light label (e.g. “Attendance / Break Reminder”).\n'

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
      temperature: 0.58,
      max_tokens: 900,
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

  const reminderTone =
    mode === 'coaching' && isLightReminderCoaching(payload?.notes, payload?.coachingReason)

  let systemPrompt
  if (mode === 'recognition') {
    systemPrompt = `${RECOGNITION_PROMPT}\n\nTOPIC GUIDE:\n${topicGuide}`
  } else {
    systemPrompt = `${COACHING_PROMPT}\n\nTOPIC GUIDE (tone and boundaries—not a template to paste):\n${topicGuide}`
    if (reminderTone) {
      systemPrompt += `\n\n${REMINDER_COACHING_MODE}`
    }
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
      ? `ISSUE_TOPIC_HINT (for category/tone only; content must come from JSON): ${issuePrimary}\n` +
        (reminderTone
          ? 'REMINDER_MODE: true — notes/reason call for a light reminder (e.g. just a reminder, not serious, light coaching, no break schedule). Follow REMINDER_MODE at the end of the system message.\n'
          : '')
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
app.set('trust proxy', 1)

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

  console.log('[webhook/stripe] event type:', event.type, 'id:', event.id)

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const customerId = pickStripeId(session.customer)
      const subscriptionId = pickStripeId(session.subscription)
      const metadataUserId =
        session.metadata && typeof session.metadata.userId === 'string'
          ? session.metadata.userId
          : null

      console.log('[webhook/stripe] checkout.session.completed', {
        sessionId: session.id,
        mode: session.mode ?? null,
        metadataUserId: metadataUserId ?? '(missing)',
        subscriptionId: subscriptionId ?? '(missing)',
      })

      if (session.mode && session.mode !== 'subscription') {
        console.warn('[webhook/stripe] checkout session mode is not subscription:', session.mode)
      }

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
      return respondStripeWebhookSync(res, event.type, result)
    }

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const subscription = event.data.object
      const customerId = pickStripeId(subscription.customer)
      const metadataUserId =
        subscription.metadata && typeof subscription.metadata.userId === 'string'
          ? subscription.metadata.userId
          : null
      if (!customerId) {
        console.error('[webhook/stripe] subscription event missing customer id', event.type)
        return res.status(200).json({ received: true, skipped: 'missing_customer_id' })
      }

      if (event.type === 'customer.subscription.deleted') {
        console.log('[webhook/stripe] subscription deleted / ended', {
          subscriptionId: subscription.id,
          status: subscription.status ?? null,
        })
      }

      if (subscription.status === 'past_due') {
        console.warn('[webhook/stripe] subscription past_due — syncing is_pro=false (no grace)', {
          subscriptionId: subscription.id,
        })
      }

      const result = await syncSubscriptionToUser({
        eventType: event.type,
        customerId,
        subscription,
        metadataUserId,
      })
      return respondStripeWebhookSync(res, event.type, result)
    }

    if (
      event.type === 'invoice.paid' ||
      event.type === 'invoice.payment_succeeded' ||
      event.type === 'invoice.payment_failed'
    ) {
      const invoice = event.data.object
      const customerId = pickStripeId(invoice.customer)
      const subscriptionId = pickStripeId(invoice.subscription)
      const billingReason = typeof invoice.billing_reason === 'string' ? invoice.billing_reason : null

      const isPaidEvent = event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded'

      if (isPaidEvent && billingReason === 'subscription_cycle') {
        console.log('[webhook/stripe] RENEWAL invoice paid (subscription_cycle)', {
          eventType: event.type,
          invoiceId: invoice.id,
          subscriptionId,
          amountPaid: invoice.amount_paid ?? null,
          periodEnd: invoice.lines?.data?.[0]?.period?.end ?? null,
        })
      } else if (isPaidEvent) {
        console.log('[webhook/stripe] invoice paid', {
          eventType: event.type,
          invoiceId: invoice.id,
          billingReason,
          subscriptionId,
        })
      } else {
        console.warn('[webhook/stripe] invoice.payment_failed — renewal or charge failed; subscription will sync (past_due => is_pro false)', {
          invoiceId: invoice.id,
          subscriptionId,
          billingReason,
          attemptCount: invoice.attempt_count ?? null,
          nextPaymentAttempt: invoice.next_payment_attempt ?? null,
        })
      }

      if (!customerId || !subscriptionId) {
        console.error('[webhook/stripe] invoice event missing customer or subscription id')
        return res.status(200).json({ received: true, skipped: 'missing_customer_or_subscription' })
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const result = await syncSubscriptionToUser({
        eventType: event.type,
        customerId,
        subscription,
        metadataUserId:
          subscription.metadata && typeof subscription.metadata.userId === 'string'
            ? subscription.metadata.userId
            : null,
      })
      return respondStripeWebhookSync(res, event.type, result)
    }
  } catch (err) {
    const message = typeof err?.message === 'string' ? err.message : 'webhook handling failed'
    console.error('[webhook/stripe] Handler EXCEPTION — returning 500 for Stripe retry:', message, err)
    return res.status(500).json({ received: false, handlerError: message })
  }

  console.log('[webhook/stripe] unhandled event type (noop):', event.type)
  return res.status(200).json({ received: true, unhandled: event.type })
})

app.use(cors({ origin: true }))
app.use(express.json({ limit: '256kb' }))

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
    .select('id, is_pro, usage_count, subscription_status, current_period_end')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) {
    return { profile: null, error: error?.message || 'Could not load profile.' }
  }
  return { profile: data, error: null }
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
      subscription_data: {
        metadata: { userId },
      },
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

/**
 * Authenticated: re-fetch subscription from Stripe and sync profiles (webhook backup).
 */
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
app.post('/api/billing/reconcile-subscription', handleBillingReconcileSubscription)
app.post('/api/billing/admin/resync-all', handleBillingAdminResyncAll)

app.post('/api/ai', apiAiRateLimiter, async (req, res) => {
  debugLog('SERVER_API_AI_HIT')
  const authHeader = req.headers.authorization
  if (!authHeader || typeof authHeader !== 'string') {
    return res.status(401).json({ ok: false, error: 'Unauthorized' })
  }
  const action = req.body?.action
  let payload = req.body?.payload
  let isTutorialRun = false
  let authUserId = null
  let authUserEmail = null
  let usageSnapshot = null
  if (!action || typeof action !== 'string' || !payload || typeof payload !== 'object') {
    console.error('[api/ai] bad request: expected { action, payload }')
    return res.status(400).json({ ok: false, error: 'Expected { action, payload }.' })
  }

  debugLog('SERVER_API_AI_AUTH_HEADER_EXISTS', Boolean(req.headers.authorization))
  const auth = await getAuthenticatedUserId(req)
  if (auth.error || !auth.userId) {
    return res.status(401).json({ ok: false, error: auth.error || 'Unauthorized.' })
  }
  authUserId = auth.userId
  authUserEmail = auth.email
  debugLog('SERVER_API_AI_USER', { userId: authUserId, email: authUserEmail })

  if (action === 'coaching_log') {
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
    /** Effective Pro: Stripe active/trialing or owner allowlist (see shared/ownerFreePro.mjs). */
    const hasProAccess = usageSnapshot.isPro
    const shouldBlock = !hasProAccess && usageSnapshot.usageCount >= FREE_LIMIT
    debugLog('SERVER_API_AI_USAGE_CHECK', {
      userId: authUserId,
      isPro: usageSnapshot.isPro,
      usageCountBefore: usageSnapshot.usageCount,
      usageCountAfter: usageSnapshot.usageCount,
      freeLimit: FREE_LIMIT,
      remaining: usageSnapshot.remaining,
      shouldBlock,
    })
    const freeLimitReached = !hasProAccess && usageSnapshot.usageCount >= FREE_LIMIT
    if (!isTutorialRun && freeLimitReached) {
      return res.status(403).json({ ok: false, code: 'FREE_LIMIT_REACHED', error: 'Free limit reached' })
    }
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

const PORT = process.env.PORT || 3001
const HOST = '0.0.0.0'

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`)
  if (hasFrontendBuild) {
    console.log('[static] Serving SPA and static files from', path.resolve(distDir))
  }
})
 