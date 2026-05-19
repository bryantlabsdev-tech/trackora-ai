import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { shouldUseMobileExpertContext } from './coachingContextRouting.mjs'

describe('shouldUseMobileExpertContext', () => {
  it('returns true for mobile expert role/type in wireless workspace', () => {
    assert.equal(
      shouldUseMobileExpertContext({
        coachingWorkspace: 'mobile_sales',
        coachingType: 'mobile_expert',
        role: 'ME',
      }),
      true,
    )
  })

  it('returns false for non-mobile role/type even in wireless workspace', () => {
    assert.equal(
      shouldUseMobileExpertContext({
        coachingWorkspace: 'mobile_sales',
        coachingType: 'leadership',
        role: 'manager',
      }),
      false,
    )
  })

  it('returns false for general workspace', () => {
    assert.equal(
      shouldUseMobileExpertContext({
        coachingWorkspace: 'general_workplace',
        coachingType: 'mobile_expert',
        role: 'ME',
      }),
      false,
    )
  })
})
