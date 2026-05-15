import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseApiAiRequest, parseCreateCheckoutSession } from './schemas.mjs'

describe('parseApiAiRequest', () => {
  it('accepts coaching_log with object payload', () => {
    const r = parseApiAiRequest({
      action: 'coaching_log',
      payload: { employeeName: 'Alex', coachingReason: 'Late', mode: 'coaching' },
    })
    assert.equal(r.ok, true)
  })

  it('rejects missing payload object', () => {
    const r = parseApiAiRequest({ action: 'coaching_log', payload: 'nope' })
    assert.equal(r.ok, false)
  })

  it('rejects empty action', () => {
    const r = parseApiAiRequest({ action: '', payload: {} })
    assert.equal(r.ok, false)
  })
})

describe('parseCreateCheckoutSession', () => {
  it('requires UUID userId', () => {
    const r = parseCreateCheckoutSession({ userId: 'not-a-uuid', email: 'a@b.com' })
    assert.equal(r.ok, false)
  })

  it('accepts valid checkout body', () => {
    const r = parseCreateCheckoutSession({
      userId: '550e8400-e29b-41d4-a716-446655440000',
      email: 'lead@example.com',
      planTier: 'pro',
    })
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.data.planTier, 'pro')
  })
})
