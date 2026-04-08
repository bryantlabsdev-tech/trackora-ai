import assert from 'node:assert'
import { describe, test } from 'node:test'
import {
  buildTopicRetryUserMessage,
  coachingOutputViolatesTopicAnchor,
} from './coachingTopicValidation.mjs'

describe('coachingOutputViolatesTopicAnchor', () => {
  const userKeys = 'Left keys unattended'
  const userLate = 'Late returning from lunch'
  const userAcc = 'Missed accessory offers'

  test('flags sales language on a keys/security topic when user did not mention it', () => {
    const bad =
      'Pre-Coaching Notes:\nAlex — keys.\n\nSituation:\nBelow goal on engagement.\n\nImpact:\nMissed sales.\n'
    assert.equal(coachingOutputViolatesTopicAnchor(bad, 'compliance_security', userKeys), true)
  })

  test('does not flag when user text includes the same phrase', () => {
    const ok =
      'Pre-Coaching Notes:\nAlex — late returning from lunch.\n\nImpact:\nPunctuality matters.\n'
    assert.equal(coachingOutputViolatesTopicAnchor(ok, 'attendance', userLate), false)
  })

  test('flags security language on attendance topic', () => {
    const bad =
      'Pre-Coaching Notes:\nAlex — late.\n\nBehavior:\nLeft keys unattended again.\n'
    assert.equal(coachingOutputViolatesTopicAnchor(bad, 'attendance', userLate), true)
  })

  test('flags keys language on performance topic', () => {
    const bad =
      'Pre-Coaching Notes:\nAlex — accessories.\n\nImpact:\nVault procedures matter.\n'
    assert.equal(coachingOutputViolatesTopicAnchor(bad, 'performance_sales', userAcc), true)
  })

  test('flags attendance language on performance topic', () => {
    const bad =
      'Pre-Coaching Notes:\nAlex — offers.\n\nSituation:\nTardiness affecting results.\n'
    assert.equal(coachingOutputViolatesTopicAnchor(bad, 'performance_sales', userAcc), true)
  })

  test('unspecified does not trigger validation', () => {
    const text = 'Pre-Coaching Notes:\nBelow goal everywhere.\n'
    assert.equal(coachingOutputViolatesTopicAnchor(text, 'unspecified', 'something vague'), false)
  })
})

describe('buildTopicRetryUserMessage', () => {
  test('includes stay-on-topic instructions for compliance', () => {
    const m = buildTopicRetryUserMessage('compliance_security', 'Left keys unattended')
    assert.match(m, /Rewrite the ENTIRE coaching form/i)
    assert.match(m, /sales/i)
    assert.match(m, /attendance/i)
  })
})
