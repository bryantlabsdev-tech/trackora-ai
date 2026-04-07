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
import { sanitizeCoachingPayload } from '../shared/sanitizeCoachingPayload.mjs'

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

/** Full system prompt for corrective coaching only — never mixed with recognition. */
const COACHING_PROMPT =
  'You are an OSL/Walmart retail team lead writing a CORRECTIVE COACHING form ONLY. This system prompt is used exclusively when mode is coaching—it has nothing to do with recognition. Fast, plain, paste-ready; sounds like you wrote it between customers.\n\n' +
  'MODE — COACHING (corrective only):\n' +
  '- Corrective tone: gaps, missed opportunities, accountability, what needs to change.\n' +
  '- Direct and practical: name the gap, what it looks like on the floor, concrete next steps—not a lecture.\n\n' +
  'OUTPUT SHAPE:\n' +
  '- Use the exact section titles and order below (Walmart/OSL-style labels).\n' +
  '- Real team lead voice: realistic, human, not robotic.\n' +
  '- No fluffy filler or template openers.\n' +
  '- Copy-paste ready.\n\n' +
  'INPUT (JSON): mode, employeeName, coachingReason (main issue), notes (optional). You are generating coaching output only; ignore any thought of recognition.\n\n' +
  'LENGTH (strict):\n' +
  '- Prose sections: 1–2 short sentences each—no long paragraphs, no over-explaining.\n' +
  '- Behavior: at most 2 short sentences; be direct.\n' +
  '- Next Steps: 2–3 bullets, strong and simple.\n\n' +
  'NO REPETITION (critical):\n' +
  '- Put the full KPI/number line once (usually Pre-Coaching Notes). Do NOT paste the same numbers again in Category, Situation, Behavior, Impact, or Next Steps.\n' +
  '- After that, use light shorthand: below goal, off pace, not consistent, missing opportunities, needs improvement.\n\n' +
  'BANNED (corporate / report-speak—never use):\n' +
  '- Phrases like: "significantly below target," "areas needing immediate attention," "impacting overall effectiveness," "in order to," "leverage," "moving forward," "it is important to note," "performance indicates," "opportunity for growth," "align on expectations."\n' +
  '- Anything that sounds like a performance review essay.\n\n' +
  'USE INSTEAD (retail floor language):\n' +
  '- below goal, off pace, not consistent, needs improvement, missing opportunities, light on offers, not engaging, not closing, store behind goal, missed sales.\n\n' +
  'SENTENCES:\n' +
  '- Short and clear. Capitalize the employee name in title case when you use it (match employeeName from JSON).\n' +
  '- Bullet lines: capital letter, simple phrase.\n\n' +
  'OUTPUT QUALITY:\n' +
  '- Complete words and sentences only—no random fragments (e.g. "sq") or cut-off endings.\n\n' +
  'TONE:\n' +
  '- Direct, realistic, a little blunt—corrective but still professional.\n' +
  '- No filler openers ("This discussion centers on…," "I wanted to touch base regarding…").\n' +
  '- Pre-Coaching Notes: no "Coaching [name]" / "Issue:" label stack—just say it.\n\n' +
  'SECTIONS — exact titles, this order. Title line ends with colon, then body. No ## markdown, no bold titles, nothing before "Pre-Coaching Notes:":\n' +
  'Pre-Coaching Notes:\n' +
  'Coaching Category:\n' +
  'Situation:\n' +
  'Behavior:\n' +
  'Impact:\n' +
  'Next Steps:\n' +
  'Manager Follow-Up:\n\n' +
  'SECTION GUIDANCE:\n' +
  'Pre-Coaching Notes: 1–2 short sentences. Start with the employee’s full name. If the input has numbers or a KPI, state actual vs goal here once—only here. Fold visit notes in if useful.\n\n' +
  'Coaching Category: One short line—topic + plain reason. No number dump if already in Pre-Coaching Notes.\n\n' +
  'Situation: 1–2 short sentences. Simple and real—what’s going on with performance. Use the employee’s name. Do NOT talk about "the coaching" (no "coaching to…"). Do NOT repeat the KPI number string.\n' +
  '- Example shape: "[Name] is below goal in [topic] and not meeting expectations." Adapt to input.\n\n' +
  'Behavior: 1–2 short sentences. Focus on what the rep is NOT doing or NOT doing consistently—offers, engagement, close. No KPI number dump.\n' +
  '- Example shape: "Not consistently engaging customers. Missing opportunities to present offers and close." Adapt to topic/name as needed.\n\n' +
  'Impact: 1–2 short sentences. Missed sales, store behind goal—tight. No repeated metrics.\n' +
  '- Example shape: "This leads to missed sales and puts the store behind goal."\n\n' +
  'Next Steps: 2–3 bullets. Strong, simple actions—no metrics repeated.\n' +
  '- Example style: "Increase customer engagement" / "Hit minimum activity expectations" / "Manager check-in mid-shift"\n\n' +
  'Manager Follow-Up: 1–2 short sentences. Accountability: when you’ll follow up + what improvement you expect to see. Not corporate.\n' +
  '- Example shape: "Follow up next visit. Expect improvement in [topic] and overall activity."\n\n' +
  'TRUTH: Do not invent stats. Paraphrase the stated gap is fine.\n\n' +
  'Layout example:\n' +
  SECTION_SHAPE

/**
 * Recognition-only system prompt. Zero overlap with COACHING_PROMPT — different role, rules, and vocabulary.
 */
const RECOGNITION_PROMPT =
  'You are writing a recognition form for an employee (OSL/Walmart retail). This is NOT coaching. This prompt is used ONLY when mode is recognition.\n\n' +
  'Rules:\n' +
  '- Focus ONLY on what the employee is doing well.\n' +
  '- Highlight strengths such as: urgency, engagement, consistency, customer interaction.\n' +
  '- Reinforce positive habits.\n' +
  '- Explain positive impact on store performance (and team/customer flow when it fits).\n' +
  '- Encourage continued behavior—natural, professional, genuine.\n\n' +
  'DO NOT:\n' +
  '- Mention performance gaps.\n' +
  '- Mention "below goal" or any deficit-vs-target framing.\n' +
  '- Suggest improvement is needed, fixing problems, or corrective action.\n' +
  '- Use negative or corrective language.\n' +
  '- Use Next Steps words like: fix, improve (as in "must improve"), address gaps, close the gap, tighten up execution as a criticism.\n\n' +
  'Even if performance is not perfect:\n' +
  '- Frame it positively only.\n' +
  '- Use phrases like: solid performance, strong effort, showing consistency, good engagement, building momentum, strong floor habits.\n\n' +
  'Next Steps (recognition only):\n' +
  '- Use ONLY themes: continue, maintain, build consistency, lead by example.\n' +
  '- Example bullets: "Continue strong customer engagement" / "Maintain urgency throughout shifts" / "Keep leading by example on the floor."\n\n' +
  'Manager Follow-Up (recognition only):\n' +
  '- Supportive tone only, for example: "Will continue to support and monitor consistency. Expect performance to remain strong."\n' +
  '- No accountability for failure or expectation of "improvement" from a deficit.\n\n' +
  'Important:\n' +
  '- Recognition must NEVER sound like coaching.\n' +
  '- It should feel like: positive reinforcement, recognition of effort and performance, encouragement to continue.\n\n' +
  'INPUT (JSON): employeeName, coachingReason (what is going well), notes (optional), mode recognition.\n\n' +
  'LENGTH: 1–2 short sentences per prose section; Behavior max 2 sentences (strengths only); Next Steps 2–3 bullets.\n\n' +
  'KPI/numbers: state once if useful—usually Pre-Coaching Notes—in a neutral or positive frame; do not repeat the same number string in every section.\n\n' +
  'SENTENCES: Capitalize employee name in title case (employeeName from JSON). Bullet lines start with a capital letter.\n\n' +
  'OUTPUT QUALITY: Complete sentences only—no fragments or cut-off endings.\n\n' +
  'OUTPUT STRUCTURE — use these exact section titles in this order. Each body must be 100% positive reinforcement:\n' +
  'Pre-Coaching Notes:\n' +
  'Coaching Category:\n' +
  'Situation:\n' +
  'Behavior:\n' +
  'Impact:\n' +
  'Next Steps:\n' +
  'Manager Follow-Up:\n\n' +
  'Section hints: Pre-Coaching = name + what is going well. Category = recognition / strong execution. Situation = positive snapshot. Behavior = what they do well. Impact = why it helps the store/team. Next Steps and Manager Follow-Up per rules above.\n\n' +
  'TRUTH: Do not invent stats. If input is thin, stay positive and specific to floor strengths—never invent problems.\n\n' +
  'Layout example:\n' +
  SECTION_SHAPE

const COACHING_USER_PREFIX =
  'TASK: Coaching form only (corrective). Gaps, accountability, concrete actions to fix execution. Do not write recognition language.\n' +
  'KPI/numbers: full detail once (usually Pre-Coaching Notes), then plain words—no repeat dumps.\n' +
  'Prose 1–2 tight sentences; Behavior = misses/inconsistency; Next Steps = corrective actions; Manager Follow-Up = accountability.\n\n'

const RECOGNITION_USER_PREFIX =
  'TASK: Recognition form only. 100% positive reinforcement. You are NOT writing coaching.\n' +
  'Every section must celebrate what is working. No gaps, no below-goal language, no improvement mandates.\n' +
  'Next Steps: only continue, maintain, build consistency, lead by example.\n' +
  'Manager Follow-Up: supportive only—e.g. "Will continue to support and monitor consistency. Expect performance to remain strong."\n' +
  'Use employeeName from JSON for the rep’s name.\n\n'

/**
 * @param {{ system: string; user: string }} params
 * @returns {Promise<string>}
 */
async function callOpenAI({ system, user }) {
  if (!openai) {
    const err = new Error('OpenAI is not configured (missing OPENAI_API_KEY).')
    err.code = 'NO_KEY'
    throw err
  }

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.45,
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
 * Coaching and recognition use two entirely separate system prompts and user preambles — no shared template.
 * @param {string} action
 * @param {object} payload
 */
function buildCoachingLogMessages(action, payload) {
  if (action !== 'coaching_log') return null
  const mode = payload?.mode === 'recognition' ? 'recognition' : 'coaching'

  let systemPrompt
  if (mode === 'recognition') {
    systemPrompt = RECOGNITION_PROMPT
  } else {
    systemPrompt = COACHING_PROMPT
  }

  let userPreamble
  if (mode === 'recognition') {
    userPreamble = RECOGNITION_USER_PREFIX
  } else {
    userPreamble = COACHING_USER_PREFIX
  }

  const body = JSON.stringify(payload ?? {}, null, 2)
  return {
    system: systemPrompt,
    user:
      userPreamble +
      'Copy-paste clean plain text. No fragments or cut-off endings.\n\n' +
      `JSON:\n${body}`,
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
    const stripeCheckoutPriceId = 'price_1TJOQDHum5t4i0BDlwb3Hkgc'
    console.log('[create-checkout-session] Stripe price id:', stripeCheckoutPriceId)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: stripeCheckoutPriceId, quantity: 1 }],
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}`,
      metadata: checkoutMetadata,
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
    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` })
  }

  if (!openai) {
    return res.json({
      ok: false,
      error: 'OpenAI is not configured (missing OPENAI_API_KEY).',
      source: 'error',
      useFallback: true,
    })
  }

  try {
    const raw = await callOpenAI(messages)
    const text =
      action === 'coaching_log' ? polishGeneratedCoachingForm(raw, rawName) : raw
    return res.json({ ok: true, text, source: 'openai' })
  } catch (err) {
    const code = err.code || 'UNKNOWN'
    const message = err.message || 'AI request failed'
    if (code !== 'NO_KEY') {
      console.error('[api/ai]', code, message)
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
 