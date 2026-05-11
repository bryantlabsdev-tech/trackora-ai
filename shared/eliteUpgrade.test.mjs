import test from 'node:test'
import assert from 'node:assert/strict'
import { dedupePriceIds, findSubscriptionItemForEliteUpgrade } from './eliteUpgrade.mjs'

test('dedupePriceIds', () => {
  assert.deepEqual(dedupePriceIds(['a', 'a', '', 'b']), ['a', 'b'])
})

test('findSubscriptionItemForEliteUpgrade: already elite', () => {
  const sub = { items: { data: [{ id: 'si_1', price: { id: 'price_elite' } }] } }
  const r = findSubscriptionItemForEliteUpgrade(sub, ['price_pro'], 'price_elite')
  assert.equal(r.alreadyElite, true)
  assert.equal(r.subscriptionItemId, null)
})

test('findSubscriptionItemForEliteUpgrade: match pro price', () => {
  const sub = { items: { data: [{ id: 'si_x', price: { id: 'price_pro' } }] } }
  const r = findSubscriptionItemForEliteUpgrade(sub, ['price_pro'], 'price_elite')
  assert.equal(r.alreadyElite, false)
  assert.equal(r.subscriptionItemId, 'si_x')
})

test('findSubscriptionItemForEliteUpgrade: single unknown price line', () => {
  const sub = { items: { data: [{ id: 'si_legacy', price: { id: 'price_old' } }] } }
  const r = findSubscriptionItemForEliteUpgrade(sub, ['price_pro'], 'price_elite')
  assert.equal(r.alreadyElite, false)
  assert.equal(r.subscriptionItemId, 'si_legacy')
})

test('findSubscriptionItemForEliteUpgrade: ambiguous multi-line no pro match', () => {
  const sub = {
    items: {
      data: [
        { id: 'si_a', price: { id: 'price_unknown_a' } },
        { id: 'si_b', price: { id: 'price_unknown_b' } },
      ],
    },
  }
  const r = findSubscriptionItemForEliteUpgrade(sub, ['price_pro'], 'price_elite')
  assert.equal(r.subscriptionItemId, null)
})
