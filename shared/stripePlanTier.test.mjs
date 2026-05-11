import test from 'node:test'
import assert from 'node:assert/strict'
import { collectSubscriptionPriceIds, inferBillingPlanTierFromSubscription } from './stripePlanTier.mjs'

test('collectSubscriptionPriceIds reads item prices', () => {
  const ids = collectSubscriptionPriceIds({
    items: {
      data: [{ price: { id: 'price_elite' } }, { price: { id: 'price_add' } }],
    },
  })
  assert.deepEqual(ids, ['price_elite', 'price_add'])
})

test('inferBillingPlanTierFromSubscription: elite id match', () => {
  const sub = { items: { data: [{ price: { id: 'price_elite_x' } }] } }
  assert.equal(inferBillingPlanTierFromSubscription(sub, 'price_elite_x'), 'elite')
})

test('inferBillingPlanTierFromSubscription: no elite env → pro', () => {
  const sub = { items: { data: [{ price: { id: 'price_pro' } }] } }
  assert.equal(inferBillingPlanTierFromSubscription(sub, ''), 'pro')
})

test('inferBillingPlanTierFromSubscription: elite env but different price → pro', () => {
  const sub = { items: { data: [{ price: { id: 'price_pro' } }] } }
  assert.equal(inferBillingPlanTierFromSubscription(sub, 'price_elite_only'), 'pro')
})
