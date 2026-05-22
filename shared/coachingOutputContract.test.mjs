import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildDeterministicCoachingForm } from './coachingIssueClassifier.mjs'
import {
  finalizeCoachingOutput,
  finalizeNextStepsSectionBody,
  validateCoachingNextStepsContract,
} from './coachingOutputContract.mjs'
import { countNextStepsBullets } from './nextStepsNormalizer.mjs'
import { APS_NEXT_STEPS_BULLETS } from './apsOperationalLanguage.mjs'

const SPARSE_NEXT = `Pre-Coaching Notes:
Test

Coaching Category:
Performance

Situation:
Needs work.

Behavior:
Needs work.

Impact:
Needs work.

Next Steps:
• One bullet only

Manager Follow-Up:
Check in 5 days.`

describe('coaching output contract — 5 Next Steps bullets', () => {
  it('expands sparse coaching form to exactly 5 Next Steps', () => {
    const apsPayload = {
      mode: 'coaching',
      coachingWorkspace: 'mobile_sales',
      coachingType: 'mobile_expert',
      role: 'ME',
      coachingReason: 'Low APS',
      notes: 'APS 2.2 below goal',
    }
    const out = finalizeCoachingOutput(SPARSE_NEXT, 'Alex', apsPayload)
    const validation = validateCoachingNextStepsContract(out, apsPayload)
    assert.equal(validation.ok, true)
    assert.equal(countNextStepsBullets(out), 5)
    assert.doesNotMatch(out, /increase attempts|monitor APS/i)
  })

  it('APS coaching uses APS fallback bullets when expanding weak Next Steps', () => {
    const payload = {
      mode: 'coaching',
      coachingWorkspace: 'mobile_sales',
      coachingType: 'mobile_expert',
      role: 'ME',
      coachingReason: 'Low APS',
      notes: 'APS 2.4',
    }
    const weak = SPARSE_NEXT.replace('• One bullet only', '• Monitor APS\n• Increase attempts')
    const out = finalizeCoachingOutput(weak, 'Alex', payload)
    assert.equal(countNextStepsBullets(out), 5)
    for (const bullet of APS_NEXT_STEPS_BULLETS) {
      assert.match(out, new RegExp(bullet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
    }
  })

  it('HPA coaching form always has 5 Next Steps bullets', () => {
    const payload = {
      mode: 'coaching',
      coachingWorkspace: 'mobile_sales',
      coachingType: 'mobile_expert',
      role: 'ME',
      coachingReason: 'High HPA',
      notes: 'HPA 8.2 above goal',
    }
    const raw = buildDeterministicCoachingForm(payload)
    const out = finalizeCoachingOutput(raw, 'Alex Rivera', payload)
    assert.equal(countNextStepsBullets(out), 5)
    assert.equal(validateCoachingNextStepsContract(out, payload).ok, true)
    assert.match(out, /postpaid|opportunit|traffic|discovery/i)
  })

  it('general workplace coaching form always has 5 Next Steps bullets', () => {
    const payload = {
      mode: 'coaching',
      coachingWorkspace: 'general_workplace',
      coachingType: 'general_workplace',
      role: 'team_member',
      coachingReason: 'Attendance',
      notes: 'Late twice this week',
    }
    const raw = buildDeterministicCoachingForm(payload)
    const out = finalizeCoachingOutput(raw, 'Jordan Lee', payload)
    assert.equal(countNextStepsBullets(out), 5)
    assert.equal(validateCoachingNextStepsContract(out, payload).ok, true)
  })

  it('recognition mode does not force 5 Next Steps', () => {
    const payload = {
      mode: 'recognition',
      coachingWorkspace: 'mobile_sales',
      coachingType: 'mobile_expert',
      role: 'ME',
      coachingReason: 'Great job',
      notes: 'APS 4.0 on track',
    }
    const raw = buildDeterministicCoachingForm(payload)
    const out = finalizeCoachingOutput(raw, 'Alex', payload)
    const count = countNextStepsBullets(out)
    assert.ok(count >= 1 && count < 5, `recognition had ${count} bullets`)
  })

  it('finalizeNextStepsSectionBody expands refine output to 5 bullets', () => {
    const payload = {
      mode: 'coaching',
      coachingWorkspace: 'mobile_sales',
      coachingType: 'mobile_expert',
      role: 'ME',
      coachingReason: 'Low APS',
      notes: 'APS 2.2',
    }
    const body = '• Monitor APS\n• Track attempts'
    const out = finalizeNextStepsSectionBody(body, payload)
    const lines = out.split('\n').filter((l) => l.trim().startsWith('•'))
    assert.equal(lines.length, 5)
    assert.doesNotMatch(out, /increase attempts|monitor APS/i)
  })
})
