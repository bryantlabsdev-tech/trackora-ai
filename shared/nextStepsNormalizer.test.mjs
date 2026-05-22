import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  countNextStepsBullets,
  enforceFiveNextStepsBullets,
  normalizeNextStepsBullets,
} from './nextStepsNormalizer.mjs'

describe('normalizeNextStepsBullets', () => {
  it('enforces exactly 5 bullets for coaching mode', () => {
    const input = `Pre-Coaching Notes:
Test

Next Steps:
• Engage traffic earlier
• Present postpaid options more often
• Keep urgency up

Manager Follow-Up:
Check back in a week.`
    const out = normalizeNextStepsBullets(input, {
      mode: 'coaching',
      coachingWorkspace: 'mobile_sales',
      coachingType: 'mobile_expert',
      role: 'ME',
    })
    const m = out.match(/Next Steps:\n([\s\S]*?)\n+Manager Follow-Up:/)
    assert.ok(m)
    const count = (m?.[1].match(/^• /gm) || []).length
    assert.equal(count, 5)
  })

  it('does not modify recognition mode', () => {
    const input = `Next Steps:
• Keep it up
• Great job

Manager Follow-Up:
Supportive follow-up.`
    const out = normalizeNextStepsBullets(input, { mode: 'recognition' })
    assert.equal(out, input)
  })

  it('adds Next Steps section with 5 bullets when missing', () => {
    const input = `Pre-Coaching Notes:
Test

Manager Follow-Up:
Check in next week.`
    const out = normalizeNextStepsBullets(input, {
      mode: 'coaching',
      coachingWorkspace: 'mobile_sales',
      coachingType: 'mobile_expert',
      role: 'ME',
    })
    const m = out.match(/Next Steps:\n([\s\S]*?)\n+Manager Follow-Up:/)
    assert.ok(m)
    const count = (m?.[1].match(/^• /gm) || []).length
    assert.equal(count, 5)
  })

  it('hard-enforces 5 bullets contract even from sparse input', () => {
    const input = `Next Steps:
• Engage traffic

Manager Follow-Up:
Follow up in 5 days.`
    const out = enforceFiveNextStepsBullets(input, { mode: 'coaching', coachingWorkspace: 'mobile_sales' })
    assert.equal(countNextStepsBullets(out), 5)
  })

  it('APS coaching expands 3 bullets to 5 using APS-safe fallbacks', () => {
    const input = `Next Steps:
• Engage more customers throughout the day
• Slow down conversations to uncover customer needs
• Monitor APS daily

Manager Follow-Up:
Check in this week.`
    const out = enforceFiveNextStepsBullets(input, {
      mode: 'coaching',
      coachingWorkspace: 'mobile_sales',
      coachingType: 'mobile_expert',
      role: 'ME',
      coachingReason: 'Low APS (Attempts Per Shift)',
      notes: 'Passive on floor',
    })
    assert.equal(countNextStepsBullets(out), 5)
    assert.doesNotMatch(out, /monitor APS|increase attempts|carrier eligibility|\bport\b/i)
    assert.match(out, /Explore upgrade and new-line|Fully work each customer interaction/i)
  })

  it('APS topic without numeric APS still expands to 5 bullets', () => {
    const input = `Next Steps:
• One action
• Two action

Manager Follow-Up:
Follow up.`
    const out = enforceFiveNextStepsBullets(input, {
      mode: 'coaching',
      coachingWorkspace: 'mobile_sales',
      coachingType: 'mobile_expert',
      role: 'ME',
      coachingReason: 'Low APS',
      notes: 'Not engaging customers enough',
    })
    assert.equal(countNextStepsBullets(out), 5)
  })
})

