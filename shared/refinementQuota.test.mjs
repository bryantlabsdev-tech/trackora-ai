import test from 'node:test'
import assert from 'node:assert/strict'
import {
  effectiveRefinementCountThisMonth,
  getRefinementQuota,
  parseRefinementRow,
  proRefinementRemaining,
  refinementMonthKeyUtc,
} from './refinementQuota.mjs'

test('refinementMonthKeyUtc formats UTC month', () => {
  const d = new Date(Date.UTC(2026, 4, 10))
  assert.equal(refinementMonthKeyUtc(d), '2026-05')
})

test('parseRefinementRow reads count and valid month', () => {
  assert.deepEqual(parseRefinementRow({ refinement_count: 3, refinement_month: '2026-05' }), {
    count: 3,
    monthKey: '2026-05',
  })
  assert.deepEqual(parseRefinementRow({ refinement_count: '12', refinement_month: 'bad' }), {
    count: 12,
    monthKey: null,
  })
})

test('effectiveRefinementCountThisMonth is 0 when month mismatches', () => {
  const now = new Date(Date.UTC(2026, 5, 1))
  assert.equal(
    effectiveRefinementCountThisMonth({ refinement_count: 10, refinement_month: '2026-05' }, now),
    0,
  )
  assert.equal(
    effectiveRefinementCountThisMonth({ refinement_count: 10, refinement_month: '2026-06' }, now),
    10,
  )
})

test('proRefinementRemaining is infinite for owner email', () => {
  const rem = proRefinementRemaining(
    25,
    { is_pro: false, refinement_count: 99, refinement_month: '2026-05' },
    'ferrisbryant17@yahoo.com',
    new Date(Date.UTC(2026, 4, 10)),
  )
  assert.equal(rem, Number.POSITIVE_INFINITY)
})

test('proRefinementRemaining is infinite for Elite plan', () => {
  const rem = proRefinementRemaining(
    25,
    {
      is_pro: true,
      subscription_status: 'active',
      plan_tier: 'elite',
      refinement_count: 99,
      refinement_month: '2026-05',
    },
    'buyer@example.com',
    new Date(Date.UTC(2026, 4, 10)),
  )
  assert.equal(rem, Number.POSITIVE_INFINITY)
})

test('getRefinementQuota: Elite subscriber has unlimited refinements', () => {
  const q = getRefinementQuota(
    {
      is_pro: true,
      subscription_status: 'active',
      plan_tier: 'elite',
      email: 'e@example.com',
    },
    25,
    'e@example.com',
  )
  assert.equal(q.unlimited, true)
  assert.equal(q.canRefine, true)
})
