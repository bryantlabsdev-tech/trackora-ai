import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyApsLanguageGuard } from './apsLanguageGuard.mjs'

const apsPayload = {
  coachingReason: 'APS 2.4 below goal',
  notes: 'APS 2.4 below goal, weak carrier checks during traffic',
}

describe('applyApsLanguageGuard', () => {
  it('rewrites banned KPI phrasing to operational language', () => {
    const input =
      'Behavior: Increase attempts and monitor APS. Focus on attempts per shift and tablet eligibility.'
    const out = applyApsLanguageGuard(input, apsPayload)
    assert.doesNotMatch(
      out,
      /increase attempts|monitor APS|tablet eligibility|focus on attempts|attempts per shift/i,
    )
    assert.match(out, /carrier|opportunit|interaction/i)
  })

  it('does nothing when APS is not present', () => {
    const input = 'Behavior: Increase attempts and monitor APS.'
    const out = applyApsLanguageGuard(input, {
      coachingReason: 'HPA 8.0 above goal',
      notes: 'Low postpaid production',
    })
    assert.equal(out, input)
  })

  it('applies operational next steps bank for low APS', () => {
    const input = [
      'Pre-Coaching Notes:',
      'Alex',
      '',
      'Situation:',
      'Increase attempts to hit target 3.5 APS.',
      '',
      'Behavior:',
      'Focus on attempts.',
      '',
      'Impact:',
      'Low output.',
      '',
      'Next Steps:',
      '• Improve attempts',
      '• Monitor APS',
      '',
      'Manager Follow-Up:',
      'Check in 5 days.',
    ].join('\n')
    const out = applyApsLanguageGuard(input, apsPayload)
    assert.match(out, /Engage more customers throughout the day/i)
    assert.match(out, /Fully work each customer interaction/i)
    assert.doesNotMatch(out, /carrier eligibility|check eligibility/i)
    assert.doesNotMatch(out, /increase attempts|monitor APS|improve attempts|target 3\.5 APS/i)
  })
})
