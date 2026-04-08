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

const supabaseUrl = process.env.SUPABASE_URL?.trim() || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''
const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null

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
  '- If the user gave numbers, state them once (usually Pre-Coaching Notes). Never invent metrics.\n\n' +
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
  'Pre-Coaching Notes: Open with the employee’s name; frame the issue clearly from their input.\n' +
  'Coaching Category: One natural line aligned with the topic they raised.\n' +
  'Situation / Behavior / Impact: Stay on that same thread—specific, readable, not generic filler.\n' +
  'Next Steps: Practical bullets that fit the issue.\n' +
  'Manager Follow-Up: Short accountability line tied to the same topic.\n\n' +
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
  'If numbers exist in the JSON, mention them once in Pre-Coaching Notes; never invent KPIs.\n\n'

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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    console.log('[webhook/stripe] checkout.session.completed session id:', session.id)

    const userId = session.metadata?.userId
    console.log('[webhook/stripe] metadata.userId:', userId != null && userId !== '' ? userId : '(missing)')

    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer && typeof session.customer === 'object' && 'id' in session.customer
          ? session.customer.id
          : null
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription && typeof session.subscription === 'object' && 'id' in session.subscription
          ? session.subscription.id
          : null

    console.log('[webhook/stripe] customer id:', customerId ?? '(none)')
    console.log('[webhook/stripe] subscription id:', subscriptionId ?? '(none)')

    if (!userId || String(userId).trim() === '') {
      console.error(
        '[webhook/stripe] FAIL: metadata.userId is missing or empty — cannot unlock Pro; fix checkout metadata',
      )
      return res.status(200).json({ received: true, skipped: 'missing_userId' })
    }

    if (!supabaseAdmin) {
      console.error('[webhook/stripe] Supabase admin not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
      return res.status(200).json({ received: true, skipped: 'no_supabase_admin' })
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({
        is_pro: true,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
      })
      .eq('id', String(userId).trim())
      .select('id')

    if (error) {
      console.error('[webhook/stripe] Supabase update failed:', error.message)
      return res.status(200).json({ received: true, supabaseError: error.message })
    }
    if (!data?.length) {
      console.error('[webhook/stripe] Supabase update: no row updated for profile id:', String(userId).trim())
      return res.status(200).json({ received: true, warning: 'no_row_updated' })
    }
    console.log('[webhook/stripe] Supabase update succeeded for profile id:', String(userId).trim())
  }

  return res.status(200).json({ received: true })
})

app.use(cors({ origin: true }))
app.use(express.json({ limit: '256kb' }))

app.get('/', (_req, res) => {
  res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TrackoraAI</title>
  </head>
  <body style="font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.5;">
    <h1>TrackoraAI</h1>
    <p><strong>AI-powered coaching form generator for sales teams</strong></p>
    <p>
      TrackoraAI helps team leads quickly generate structured coaching and recognition forms using AI.
      Users can enter employee context, generate polished output, and copy section-by-section content
      for real-world store leadership workflows.
    </p>
  </body>
</html>`)
})

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
    const stripeCheckoutPriceId = 'price_1TJaIIHG6iuq9JCNXyc4I5Hb'
    console.log('[create-checkout-session] Stripe price id:', stripeCheckoutPriceId)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: stripeCheckoutPriceId, quantity: 1 }],
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}`,
      metadata: checkoutMetadata,
      discounts: [
        {
          coupon: '2RPLJgI1',
        },
      ],
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

const PORT = process.env.PORT || 3001
const HOST = '0.0.0.0'

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`)
})
 