import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyHpaLanguageGuard } from './hpaLanguageGuard.mjs'

describe('applyHpaLanguageGuard', () => {
  it('rewrites literal HPA speed wording when no speed signals exist', () => {
    const input =
      'Behavior: The rep is taking too long between postpaid activations and should focus on improving your conversion habits. Next Steps: track your activation flow and improve closing sales.'
    const out = applyHpaLanguageGuard(input, {
      coachingReason: 'HPA 8.8 above goal',
      notes: 'Low postpaid opportunity creation during the shift',
    })
    assert.doesNotMatch(out, /taking too long between postpaid activations|improving your conversion habits/i)
    assert.doesNotMatch(out, /track your activation flow|closing sales/i)
    assert.match(out, /postpaid output pace is below target for hours worked/i)
    assert.match(out, /postpaid conversations and activations each shift/i)
  })

  it('keeps speed/process wording when explicit slow-ops signals exist', () => {
    const input = 'Behavior: tighten activation flow and reduce step gaps.'
    const out = applyHpaLanguageGuard(input, {
      coachingReason: 'HPA 8.8 and MPT 62',
      notes: 'slow transactions and paperwork delays',
    })
    assert.equal(out, input)
  })

  it('does nothing when HPA is not present', () => {
    const input = 'Behavior: tighten activation flow and reduce step gaps.'
    const out = applyHpaLanguageGuard(input, {
      coachingReason: 'APS 2.4 needs activity',
      notes: 'No HPA provided',
    })
    assert.equal(out, input)
  })

  it('expands Next Steps to at least 4 bullets in HPA context', () => {
    const input = `Behavior:
Need stronger urgency with customer engagement.

Next Steps:
• Engage traffic earlier
• Present postpaid options more often

Manager Follow-Up:
Check in next week.`
    const out = applyHpaLanguageGuard(input, {
      coachingReason: 'HPA 8.4 above goal',
      notes: 'Low postpaid opportunity creation this week',
    })
    const nextStepsMatch = out.match(/Next Steps:\n([\s\S]*?)\n+Manager Follow-Up:/)
    assert.ok(nextStepsMatch)
    const count = (nextStepsMatch?.[1].match(/^• /gm) || []).length
    assert.ok(count >= 4 && count <= 5, `Expected 4-5 bullets, got ${count}`)
  })

  it('removes deny-list HPA terms in non-speed contexts', () => {
    const input =
      'Behavior: avoid passive behavior, not qualifying leads/customers, and stop focusing on activation timing, transaction speed, or process optimization.'
    const out = applyHpaLanguageGuard(input, {
      coachingReason: 'HPA 8.0 above goal',
      notes: 'Low postpaid production and weak traffic conversion',
    })
    assert.doesNotMatch(
      out,
      /qualifying leads|qualifying customers|activation timing|transaction speed|process optimization/i,
    )
  })

  it('rewrites full blocked HPA phrase set when no speed overlap exists', () => {
    const input =
      'Behavior: taking too long between activations with weak workflow efficiency. Next Steps: reduce time between activations, streamline activations, and focus on closing techniques.'
    const out = applyHpaLanguageGuard(input, {
      coachingReason: 'HPA 9.1 above goal',
      notes: 'Needs more postpaid opportunities and stronger customer engagement',
    })
    assert.doesNotMatch(
      out,
      /time between activations|taking too long between activations|reduce time between activations|activation timing|activation flow|streamlin(?:e|ing) activations|workflow efficiency|process optimization|closing techniques/i,
    )
  })
})

