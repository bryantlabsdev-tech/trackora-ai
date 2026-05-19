import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isWirelessSalesPerformanceTopic,
  shouldUseMobileExpertContext,
} from './coachingContextRouting.mjs'

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

describe('isWirelessSalesPerformanceTopic', () => {
  it('detects wireless sales performance topics', () => {
    assert.equal(
      isWirelessSalesPerformanceTopic({
        coachingReason: 'High HPA and low conversion',
        notes: 'Needs better discovery questions in electronics traffic',
      }),
      true,
    )
  })

  it('ignores non-wireless workplace topics', () => {
    assert.equal(
      isWirelessSalesPerformanceTopic({
        coachingReason: 'Attendance and professionalism follow-up',
        notes: 'Late to shift',
      }),
      false,
    )
  })
})
