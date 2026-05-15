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
})
