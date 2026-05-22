import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { handleStripeWebhookEvent } from './stripeWebhookHandler.mjs'
import { resetStripeEventIdempotencyForTests } from './webhookIdempotency.mjs'

function mockRes() {
  /** @type {{ statusCode: number, body: unknown }} */
  const state = { statusCode: 200, body: null }
  return {
    status(code) {
      state.statusCode = code
      return this
    },
    json(body) {
      state.body = body
      return this
    },
    get state() {
      return state
    },
  }
}

describe('handleStripeWebhookEvent', () => {
  beforeEach(() => resetStripeEventIdempotencyForTests())

  it('skips duplicate event ids', async () => {
    const res1 = mockRes()
    const res2 = mockRes()
    const deps = {
      stripe: {
        subscriptions: { retrieve: async () => ({ id: 'sub_1', customer: 'cus_1', status: 'active', items: { data: [] } }) },
      },
      respondStripeWebhookSync: (_res, _type, result) => _res.status(200).json({ received: true, result }),
    }
    const event = {
      id: 'evt_dup_test',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          customer: 'cus_1',
          status: 'active',
          metadata: { userId: '550e8400-e29b-41d4-a716-446655440000' },
        },
      },
    }

    await handleStripeWebhookEvent(event, res1, deps)
    await handleStripeWebhookEvent(event, res2, deps)

    assert.equal(res1.state.body?.received, true)
    assert.equal(res2.state.body?.duplicate, true)
  })

  it('returns noop for unhandled event types', async () => {
    const res = mockRes()
    await handleStripeWebhookEvent(
      { id: 'evt_unknown', type: 'account.updated', data: { object: {} } },
      res,
      {
        stripe: {},
        respondStripeWebhookSync: (r) => r.status(200).json({ ok: true }),
      },
    )
    assert.equal(res.state.body?.unhandled, 'account.updated')
  })

  it('falls back to customer subscription lookup for invoice.payment_failed without subscription id', async () => {
    const res = mockRes()
    /** @type {string[]} */
    const calls = []
    const deps = {
      stripe: {
        customers: {
          retrieve: async () => ({ id: 'cus_1', email: 'test@example.com' }),
        },
        subscriptions: {
          list: async () => {
            calls.push('list')
            return { data: [{ id: 'sub_fallback', status: 'past_due', customer: 'cus_1', metadata: {} }] }
          },
          retrieve: async (id) => {
            calls.push(`retrieve:${id}`)
            return { id, customer: 'cus_1', status: 'past_due', metadata: {}, items: { data: [] } }
          },
        },
      },
      respondStripeWebhookSync: (r, eventType, result) => r.status(200).json({ received: true, eventType, result }),
    }
    const event = {
      id: 'evt_invoice_missing_sub',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_1',
          customer: 'cus_1',
          subscription: null,
          billing_reason: 'subscription_cycle',
          customer_email: 'test@example.com',
        },
      },
    }

    await handleStripeWebhookEvent(event, res, deps)

    assert.equal(res.state.statusCode, 200)
    assert.equal(res.state.body?.received, true)
    assert.equal(calls.includes('list'), true)
    assert.equal(calls.includes('retrieve:sub_fallback'), true)
  })
})
