import assert from 'node:assert'
import { describe, test } from 'node:test'
import {
  evaluateSubscriptionAccess,
  profileRowGrantsPremium,
  stripeSubscriptionStatusGrantsPro,
} from './billingSubscription.mjs'

describe('stripeSubscriptionStatusGrantsPro', () => {
  test('only active and trialing', () => {
    assert.equal(stripeSubscriptionStatusGrantsPro('active'), true)
    assert.equal(stripeSubscriptionStatusGrantsPro('trialing'), true)
    assert.equal(stripeSubscriptionStatusGrantsPro('ACTIVE'), true)
    assert.equal(stripeSubscriptionStatusGrantsPro('past_due'), false)
    assert.equal(stripeSubscriptionStatusGrantsPro('unpaid'), false)
    assert.equal(stripeSubscriptionStatusGrantsPro('incomplete'), false)
    assert.equal(stripeSubscriptionStatusGrantsPro('incomplete_expired'), false)
    assert.equal(stripeSubscriptionStatusGrantsPro('canceled'), false)
    assert.equal(stripeSubscriptionStatusGrantsPro('paused'), false)
  })
})

describe('evaluateSubscriptionAccess', () => {
  test('past_due is never Pro', () => {
    const access = evaluateSubscriptionAccess({
      status: 'past_due',
      current_period_end: Math.floor(Date.now() / 1000) + 86400 * 7,
    })
    assert.equal(access.isPro, false)
    assert.equal(access.subscriptionStatus, 'past_due')
  })

  test('active is Pro', () => {
    const access = evaluateSubscriptionAccess({
      status: 'active',
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
    })
    assert.equal(access.isPro, true)
  })
})

describe('profileRowGrantsPremium (matches client hasPremiumAccess)', () => {
  test('past_due row with stale is_pro is not premium', () => {
    assert.equal(
      profileRowGrantsPremium({
        is_pro: true,
        subscription_status: 'past_due',
      }),
      false,
    )
  })

  test('active + is_pro is premium', () => {
    assert.equal(
      profileRowGrantsPremium({
        is_pro: true,
        subscription_status: 'active',
      }),
      true,
    )
  })

  test('is_pro false never premium', () => {
    assert.equal(
      profileRowGrantsPremium({
        is_pro: false,
        subscription_status: 'active',
      }),
      false,
    )
  })
})
