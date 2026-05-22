import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyHumanCompression } from './humanCompression.mjs'

describe('applyHumanCompression', () => {
  it('compresses overexplained HPA sentence into direct coaching', () => {
    const input =
      "Your HPA is currently at 8.8, indicating there’s a gap in postpaid activations relative to the hours worked."
    const out = applyHumanCompression(input, {
      mode: 'coaching',
      coachingWorkspace: 'mobile_sales',
      coachingType: 'mobile_expert',
      role: 'ME',
    })
    assert.match(out, /Your HPA is at 8\.8/i)
    assert.match(out, /Need stronger postpaid production throughout the shift\./i)
  })

  it('does not run in recognition mode', () => {
    const input = 'I need you to focus on improving conversion activity.'
    const out = applyHumanCompression(input, { mode: 'recognition', coachingWorkspace: 'mobile_sales' })
    assert.equal(out, input)
  })
})

