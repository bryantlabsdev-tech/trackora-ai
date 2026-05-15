import { openai, MODEL } from '../config.mjs'

export async function callOpenAIChat(chatMessages, opts = {}) {
  if (!openai) {
    const err = new Error('OpenAI is not configured (missing OPENAI_API_KEY).')
    err.code = 'NO_KEY'
    throw err
  }

  const max_tokens = typeof opts.maxTokens === 'number' ? opts.maxTokens : 900
  const temperature = typeof opts.temperature === 'number' ? opts.temperature : 0.58

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: chatMessages,
      temperature,
      max_tokens,
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
 * @param {{ maxTokens?: number; temperature?: number }} [opts]
 */
export async function callOpenAIChatWithOneRetry(chatMessages, opts) {
  try {
    return await callOpenAIChat(chatMessages, opts)
  } catch (e) {
    if (e && typeof e === 'object' && e.code === 'NO_KEY') throw e
    console.warn('[api/ai] OpenAI call failed, retrying once:', e?.message)
    return await callOpenAIChat(chatMessages, opts)
  }
}

