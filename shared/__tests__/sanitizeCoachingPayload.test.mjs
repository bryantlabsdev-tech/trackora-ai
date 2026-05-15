import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeCoachingPayload } from '../sanitizeCoachingPayload.mjs'

describe('sanitizeCoachingPayload', () => {
  it('normalizes employee name and trims coaching fields', () => {
    const out = sanitizeCoachingPayload({
      employeeName: '  jane doe  ',
      coachingReason: 'Late to shift',
      notes: '  arrived 10 min late  ',
      mode: 'coaching',
      coachingWorkspace: 'mobile_sales',
    })
    assert.equal(out.employeeName, 'jane doe')
    assert.equal(out.coachingReason, 'Late to shift')
    assert.equal(out.notes, 'arrived 10 min late')
    assert.equal(out.mode, 'coaching')
    assert.equal(out.coachingWorkspace, 'mobile_sales')
  })

  it('rejects unknown workspace with default mobile_sales', () => {
    const out = sanitizeCoachingPayload({
      employeeName: 'Alex',
      coachingReason: 'Test',
      notes: '',
      coachingWorkspace: 'invalid',
    })
    assert.equal(out.coachingWorkspace, 'mobile_sales')
  })
})
