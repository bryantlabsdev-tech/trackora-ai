import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSafeCheckout } from './safeCheckout.mjs'

function fixture({ subscriptions = [], sessions = [], customers = [] } = {}) {
  const calls = []
  const iterable = values => ({ async *[Symbol.asyncIterator]() { yield* values } })
  const stripe = {
    customers: { list: () => iterable(customers), create: async () => { calls.push('customer'); return { id: 'cus_new' } } },
    subscriptions: { list: () => iterable(subscriptions.map(s => ({ metadata: { userId: 'user_1' }, ...s }))), retrieve: async id => subscriptions.find(s => s.id === id) },
    checkout: { sessions: {
      list: () => iterable(sessions.map(s => ({ client_reference_id: 'user_1', ...s }))),
      create: async (params, options) => { calls.push({ params, options }); return { url: 'https://checkout.stripe.com/new' } },
    } },
  }
  return { stripe, calls, profile: {}, userId: 'user_1', email: 'user@example.com', planTier: 'pro', priceId: 'price_1', appUrl: 'https://example.com' }
}

for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']) {
  test(`blocks another subscription when Stripe has ${status}, even with a stale free profile`, async () => {
    const f = fixture({ customers: [{ id: 'cus_legacy' }], subscriptions: [{ id: 'sub_1', status }] })
    await assert.rejects(createSafeCheckout(f), { code: 'EXISTING_SUBSCRIPTION' })
    assert.deepEqual(f.calls, [])
  })
}
test('reuses open payment session', async () => {
  const f = fixture({ customers: [{ id: 'cus_1' }], sessions: [{ id: 'cs_1', mode: 'subscription', status: 'open', metadata: { planTier: 'pro' }, url: 'https://checkout.stripe.com/existing' }] })
  assert.equal((await createSafeCheckout(f)).url, 'https://checkout.stripe.com/existing')
  assert.deepEqual(f.calls, [])
})
test('blocks a simultaneous checkout for another plan', async () => {
  const f = fixture({ customers: [{ id: 'cus_1' }], sessions: [{ id: 'cs_1', mode: 'subscription', status: 'open', metadata: { planTier: 'elite' } }] })
  await assert.rejects(createSafeCheckout(f), { code: 'CHECKOUT_ALREADY_OPEN' })
})
test('repeated requests use the same customer and session idempotency keys', async () => {
  const f = fixture()
  await createSafeCheckout(f)
  await createSafeCheckout(f)
  const creates = f.calls.filter(c => typeof c === 'object')
  assert.deepEqual(creates[0], creates[1])
  assert.equal(creates[0].params.customer, 'cus_new')
  assert.equal(creates[0].options.idempotencyKey, 'trackora-checkout-user_1-initial')
})
test('a canceled subscription permits resubscription using the existing customer', async () => {
  const f = fixture({ customers: [{ id: 'cus_old' }], subscriptions: [{ id: 'sub_old', status: 'canceled' }] })
  await createSafeCheckout(f)
  assert.equal(f.calls[0].params.customer, 'cus_old')
})
test('billing lookup failure never creates a checkout', async () => {
  const f = fixture()
  f.stripe.customers.list = () => { throw new Error('Stripe unavailable') }
  await assert.rejects(createSafeCheckout(f), /Stripe unavailable/)
  assert.deepEqual(f.calls, [])
})
test('finds legacy subscriptions by account metadata when billing email differs', async () => {
  const f = fixture()
  f.stripe.subscriptions.search = () => ({ async *[Symbol.asyncIterator]() { yield { id: 'sub_legacy', customer: 'cus_other_email', status: 'active' } } })
  await assert.rejects(createSafeCheckout(f), { code: 'EXISTING_SUBSCRIPTION' })
  assert.deepEqual(f.calls, [])
})
test('does not treat another product on the same billing email as Trackora access', async () => {
  const f = fixture({ customers: [{ id: 'cus_other' }], subscriptions: [{ id: 'sub_other', status: 'active', metadata: {}, items: { data: [{ price: { id: 'price_other' } }] } }] })
  await createSafeCheckout(f)
  assert.equal(f.calls[0].params.line_items[0].price, 'price_1')
})
test('recognizes a legacy Trackora price without subscription metadata', async () => {
  const f = fixture({ customers: [{ id: 'cus_old' }], subscriptions: [{ id: 'sub_old', status: 'active', metadata: {}, items: { data: [{ price: { id: 'price_1' } }] } }] })
  await assert.rejects(createSafeCheckout(f), { code: 'EXISTING_SUBSCRIPTION' })
})
test('blocks payment completed between the subscription lookup and session lookup', async () => {
  const f = fixture({ customers: [{ id: 'cus_1' }], sessions: [{ id: 'cs_paid', mode: 'subscription', status: 'complete', subscription: 'sub_just_paid' }] })
  f.stripe.subscriptions.retrieve = async () => ({ id: 'sub_just_paid', status: 'active' })
  await assert.rejects(createSafeCheckout(f), { code: 'EXISTING_SUBSCRIPTION' })
  assert.deepEqual(f.calls, [])
})
