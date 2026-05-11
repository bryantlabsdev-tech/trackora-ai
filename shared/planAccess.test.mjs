import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PLAN_TIER,
  canUseRefinements,
  getEffectivePlan,
  isElitePlan,
  isFreePlan,
  isProPlan,
} from './planAccess.mjs'

const activeProRow = {
  is_pro: true,
  subscription_status: 'active',
  plan_tier: 'pro',
  email: 'user@example.com',
}

const activeEliteRow = {
  is_pro: true,
  subscription_status: 'active',
  plan_tier: 'elite',
  email: 'user@example.com',
}

const freeRow = {
  is_pro: false,
  subscription_status: null,
  plan_tier: 'free',
  email: 'user@example.com',
}

test('getEffectivePlan: inactive subscription is free', () => {
  assert.equal(getEffectivePlan({ ...activeProRow, is_pro: true, subscription_status: 'canceled' }, null), PLAN_TIER.FREE)
})

test('getEffectivePlan: active pro row is pro', () => {
  assert.equal(getEffectivePlan(activeProRow, 'user@example.com'), PLAN_TIER.PRO)
})

test('getEffectivePlan: active elite row is elite', () => {
  assert.equal(getEffectivePlan(activeEliteRow, 'user@example.com'), PLAN_TIER.ELITE)
})

test('getEffectivePlan: owner email is elite even if row says pro', () => {
  assert.equal(getEffectivePlan(activeProRow, 'ferrisbryant17@yahoo.com'), PLAN_TIER.ELITE)
})

test('getEffectivePlan: paid active with stale plan_tier free resolves to pro', () => {
  assert.equal(
    getEffectivePlan({ ...activeProRow, plan_tier: 'free' }, 'user@example.com'),
    PLAN_TIER.PRO,
  )
})

test('canUseRefinements: free false, pro and elite true', () => {
  assert.equal(canUseRefinements(freeRow, 'user@example.com'), false)
  assert.equal(canUseRefinements(activeProRow, 'user@example.com'), true)
  assert.equal(canUseRefinements(activeEliteRow, 'user@example.com'), true)
})

test('helpers align with tier', () => {
  assert.equal(isFreePlan(freeRow, null), true)
  assert.equal(isProPlan(activeProRow, null), true)
  assert.equal(isElitePlan(activeEliteRow, null), true)
})

test('inactive elite-looking row is free', () => {
  const row = { ...activeEliteRow, is_pro: true, subscription_status: 'canceled' }
  assert.equal(getEffectivePlan(row, 'user@example.com'), PLAN_TIER.FREE)
})
