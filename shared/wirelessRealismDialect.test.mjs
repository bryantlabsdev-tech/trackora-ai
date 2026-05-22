import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyWirelessRealismDialect } from './wirelessRealismDialect.mjs'

describe('applyWirelessRealismDialect', () => {
  it('rewrites polished/corporate phrases in mobile expert context', () => {
    const input =
      'Behavior: I need you to focus on improving conversion activity and process improvement. Impact: This impacts overall productivity.'
    const out = applyWirelessRealismDialect(input, {
      coachingWorkspace: 'mobile_sales',
      coachingType: 'mobile_expert',
      role: 'ME',
    })
    assert.match(out, /Need more/i)
    assert.match(out, /consistent postpaid conversations through traffic/i)
    assert.match(out, /cleaner floor execution/i)
    assert.match(out, /postpaid output pace/i)
  })

  it('does not apply in general workplace context', () => {
    const input = 'Behavior: I need you to focus on improving conversion activity.'
    const out = applyWirelessRealismDialect(input, {
      coachingWorkspace: 'general_workplace',
      coachingType: 'general_workplace',
      role: 'team_member',
    })
    assert.equal(out, input)
  })
})

