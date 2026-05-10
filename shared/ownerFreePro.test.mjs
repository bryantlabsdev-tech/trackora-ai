import assert from 'node:assert'
import { describe, test } from 'node:test'
import { effectivePremiumAccess, isOwnerFreePro } from './ownerFreePro.mjs'

describe('isOwnerFreePro', () => {
  test('allowlisted email lowercase', () => {
    assert.equal(isOwnerFreePro('ferrisbryant17@yahoo.com'), true)
  })

  test('allowlisted email mixed case', () => {
    assert.equal(isOwnerFreePro('Ferrisbryant17@Yahoo.COM'), true)
  })

  test('other email never matches', () => {
    assert.equal(isOwnerFreePro('someone@yahoo.com'), false)
    assert.equal(isOwnerFreePro(''), false)
  })
})

describe('effectivePremiumAccess', () => {
  test('past_due row: owner email still Pro', () => {
    assert.equal(
      effectivePremiumAccess(
        { is_pro: true, subscription_status: 'past_due' },
        'ferrisbryant17@yahoo.com',
      ),
      true,
    )
  })

  test('past_due row: non-owner not Pro', () => {
    assert.equal(
      effectivePremiumAccess(
        { is_pro: true, subscription_status: 'past_due' },
        'other@yahoo.com',
      ),
      false,
    )
  })

  test('active Stripe still works for anyone', () => {
    assert.equal(
      effectivePremiumAccess(
        { is_pro: true, subscription_status: 'active' },
        'anyone@example.com',
      ),
      true,
    )
  })
})
