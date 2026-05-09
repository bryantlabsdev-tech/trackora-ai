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
import { isLightReminderCoaching } from '../shared/coachingReminderTone.mjs'
import { sanitizeCoachingPayload } from '../shared/sanitizeCoachingPayload.mjs'
import {
  buildTopicRetryUserMessage,
  coachingOutputViolatesTopicAnchor,
} from '../shared/coachingTopicValidation.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envFilePath = path.resolve(__dirname, '..', '.env')
dotenv.config({ path: envFilePath, override: true })

const debugLog = (...args) => {
  if (process.env.NODE_ENV !== 'production') console.log(...args)
}

debugLog('ENV PATH:', process.cwd())
debugLog('ENV FILE (resolved):', envFilePath)
debugLog('ENV FILE EXISTS:', fs.existsSync(envFilePath))
debugLog('OpenAI Key Loaded:', !!process.env.OPENAI_API_KEY)

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

/** Strict ordering for the model — placed first in the coaching system prompt. */
const COACHING_PRIORITY =
  'PRIORITY:\n' +
  '1. Use only the provided input (coachingReason and notes—metrics and/or scenario).\n' +
  '2. Apply APS / HPA / MPT definitions ONLY when those metrics appear in the input.\n' +
  '3. Do not mix unrelated topics or domains.\n' +
  '4. Keep content tight and realistic: aim for roughly 3–5 sentences of core manager substance across the whole form, within the required section titles below—no filler paragraphs.\n' +
  '5. Avoid generic or corporate filler language; do not invent KPIs or numbers.\n' +
  '6. The notes field (when present) strongly influences tone and severity: if it signals a reminder, informal coaching, or explicitly says this is not a write-up, the entire form must be softer, shorter, and non-disciplinary while staying truthful to coachingReason.\n\n'

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
  '- Tie on-floor behavior to business results: how effort and pacing connect to activations, store goals, earning opportunity, and avoiding long dead gaps between sales—using only what the input supports.\n\n' +
  'IF THE INPUT IS PRIMARILY A SCENARIO (not a metrics story):\n' +
  '- Address the behavior directly. Firm but professional.\n' +
  '- Explain why it matters (team, customers, safety, standards—whatever fits the scenario).\n' +
  '- Give a clear expectation moving forward.\n\n' +
  'ALWAYS: Follow PRIORITY at the top of this message. Sound like a real manager—direct and actionable.\n\n'

const COACHING_BUSINESS_OUTCOMES =
  'BUSINESS OUTCOMES — when coachingReason/notes are about selling or floor performance (metrics like APS/HPA/MPT, goals, activations, accessories, conversion, customer engagement for sales, or similar):\n' +
  '- Make Impact explicit: explain how the current behavior hurts team results—e.g. missed shots at postpaid activations, falling short of store goals, weaker commission opportunity, or too much idle time between customer touches/sales opportunities.\n' +
  '- Connect the fix to outcomes: clearer path to more activations, tighter rhythm on the floor (fewer long gaps between sales conversations), stronger alignment with store targets, and protecting what they earn—without inventing dollar amounts, quotas, or rankings not in the input.\n' +
  '- Use plain Team Lead language (not buzzwords): line of sight from behavior → opportunities → closes → contribution to the board.\n\n' +
  'When the topic is NOT about selling or performance (e.g. keys/security or attendance with no sales angle in the user text), keep Impact in that lane—safety, standards, coverage, trust—do not force sales outcomes.\n\n'

const COACHING_STRUCTURE_AND_TONE =
  'COACHING QUALITY:\n' +
  '- Retail wireless Team Lead → Mobile Expert on the floor: direct, real, slightly motivational but not corny.\n' +
  '- Every section ties to coachingReason and notes. Situation + Behavior = problem; Impact = why it matters (and sales outcomes when the topic fits); Next Steps = specific floor actions.\n' +
  '- Avoid corporate filler and invented KPIs (see PRIORITY).\n\n' +
  'EXAMPLE TONE (structure only—do not copy if it does not match the user’s topic):\n' +
  '"Your APS is low, which means you’re not getting enough customers to the tablet. That tells me opportunities are walking by without an eligibility check. Today, focus on stopping every customer in your area and getting them to eligibility before they leave electronics."\n\n'

const COACHING_PROMPT =
  COACHING_PRIORITY +
  'You are an experienced retail wireless Team Lead writing a CORRECTIVE COACHING form (mode coaching only).\n' +
  'Default context when it fits the user’s topic: phones, plans, postpaid activations, eligibility checks on the tablet, accessories, store traffic, Mobile Experts on the sales floor — use only what the user’s words imply; never invent KPIs or incidents.\n\n' +
  RETAIL_WIRELESS_METRIC_DEFINITIONS +
  COACHING_SCENARIO_VS_METRICS +
  COACHING_BUSINESS_OUTCOMES +
  COACHING_STRUCTURE_AND_TONE +
  'VOICE & STAY ON TOPIC:\n' +
  '- Professional, direct, slightly conversational; first-person where it fits ("I expect...", "We need to see...").\n' +
  '- Anchor to coachingReason and notes; polish like a real manager. Add only closely related context for the SAME topic.\n' +
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
  'Pre-Coaching Notes: Open with the employee’s name; frame the issue clearly from their input. If numbers/goal context exists, put the specific actual vs expected here.\n' +
  'Coaching Category: One natural line aligned with the topic they raised.\n' +
  'Situation: State what happened in plain manager language, tied to the input.\n' +
  'Behavior: State the observed behavior and the expected behavior/standard.\n' +
  'Impact: Explain concrete impact tied to the same issue (no unrelated domains). For sales/performance topics, spell out how this affects activations, goals, earning opportunity, or idle gaps between sales—when justified by the input.\n' +
  'Next Steps: Practical, actionable bullets tied directly to the issue and expectation.\n' +
  'Manager Follow-Up: Include timing and a direct expectation statement ("I expect...").\n\n' +
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
  'TASK: Write the full coaching form. Stay anchored to coachingReason and notes; polished but not generic.\n' +
  'Optional notes are authoritative for tone: phrases like “just a reminder,” “friendly reminder,” “not a write-up,” “light coaching,” or “verbal reminder” mean a SHORT alignment reminder—not a disciplinary coaching document. Match that intent in every section.\n' +
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
  '- Write a quick floor alignment REMINDER. This is not a formal write-up or heavy corrective document.\n' +
  '- Professional, warm, and brief—like a short check-in.\n\n' +
  'STRICTLY AVOID (and close variants):\n' +
  '- Words/phrases: compliance, policy violation, disciplinary, corrective action, disrupt productivity, undermine, performance improvement plan, PIP.\n' +
  '- Harsh expectation phrasing: “I expect,” “we expect,” “expect to see” (use softer wording: “going forward, please…,” “let’s keep…,” “I’ll check in…”).\n' +
  '- “Expected schedule” / “break schedule” is fine when describing timing neutrally.\n\n' +
  'LENGTH & SHAPE:\n' +
  '- Same section titles and order as the main prompt.\n' +
  '- Every section: 1–2 SHORT sentences (one sentence is OK for Behavior or Impact).\n' +
  '- Next Steps: 2–3 concise bullets.\n' +
  '- Coaching Category: light label (e.g. “Attendance / Break Reminder”)—never “Policy Violation” or disciplinary framing.\n\n' +
  'CONTENT:\n' +
  '- Pre-Coaching Notes: open with the employee’s name; mirror reminder language from notes when present; state the facts from coachingReason plainly.\n' +
  '- Situation / Behavior: neutral, factual, forward-looking—no scolding.\n' +
  '- Impact: light “why it helps the team” (coverage, rhythm, consistency)—no doom framing.\n' +
  '- Manager Follow-Up: supportive (e.g. will monitor lightly / check in if something needs adjusting)—not threatening.\n'

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
          ? 'REMINDER_MODE: true — notes call for a light reminder / informal alignment (not a formal write-up). Follow REMINDER_MODE rules at the end of the system message.\n'
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
    .select('id, is_pro, usage_count')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) {
    return { profile: null, error: error?.message || 'Could not load profile.' }
  }
  return { profile: data, error: null }
}

function usageEnvelope(profile) {
  const raw = Number(profile?.usage_count ?? 0)
  const usageCount = Number.isFinite(raw) ? Math.trunc(raw) : 0
  const isPro = Boolean(profile?.is_pro)
  const remaining = isPro ? Number.POSITIVE_INFINITY : FREE_LIMIT - usageCount
  return { usageCount, isPro, remaining, freeLimit: FREE_LIMIT }
}

async function recordServerSideGenerationUsage(userId) {
  if (!supabaseAdmin) return
  const profileResult = await getProfileForUser(userId)
  if (!profileResult.profile || profileResult.error) {
    console.error('SERVER_USAGE_UPDATE_ERROR', { userId, error: profileResult.error || 'profile_missing' })
    return null
  }
  const profile = profileResult.profile
  if (profile.is_pro) {
    const snapshot = usageEnvelope(profile)
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
    usageSnapshot = usageEnvelope(profile)
    const shouldBlock = !profile.is_pro && usageSnapshot.usageCount >= FREE_LIMIT
    debugLog('SERVER_API_AI_USAGE_CHECK', {
      userId: authUserId,
      isPro: usageSnapshot.isPro,
      usageCountBefore: usageSnapshot.usageCount,
      usageCountAfter: usageSnapshot.usageCount,
      freeLimit: FREE_LIMIT,
      remaining: usageSnapshot.remaining,
      shouldBlock,
    })
    const freeLimitReached = !profile.is_pro && usageSnapshot.usageCount >= FREE_LIMIT
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
        const updated = await recordServerSideGenerationUsage(authUserId)
        if (updated) usageSnapshot = usageEnvelope(updated)
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
        const updated = await recordServerSideGenerationUsage(authUserId)
        if (updated) usageSnapshot = usageEnvelope(updated)
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
        const updated = await recordServerSideGenerationUsage(authUserId)
        if (updated) usageSnapshot = usageEnvelope(updated)
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
        const updated = await recordServerSideGenerationUsage(authUserId)
        if (updated) usageSnapshot = usageEnvelope(updated)
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
 