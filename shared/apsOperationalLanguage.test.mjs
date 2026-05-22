import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildDeterministicCoachingForm } from './coachingIssueClassifier.mjs'
import { finalizeCoachingOutput } from './coachingOutputContract.mjs'
import {
  APS_PHRASE_BLACKLIST,
  analyzeApsPhraseFrequency,
  findApsPhraseViolations,
  validateApsCoachingLanguage,
} from './apsOperationalLanguage.mjs'
import { countNextStepsBullets } from './nextStepsNormalizer.mjs'

const LOW_APS_CASES = [
  { aps: 2.0, notes: 'Low APS, passive on floor' },
  { aps: 2.1, notes: 'APS 2.1 below goal, not working carriers' },
  { aps: 2.2, notes: 'Weak traffic engagement APS 2.2' },
  { aps: 2.3, notes: 'APS 2.3 needs more customer conversations' },
  { aps: 2.4, notes: 'Low APS 2.4 action alley quiet' },
  { aps: 2.5, notes: 'APS 2.5 missing upgrade opportunities' },
  { aps: 2.6, notes: 'APS 2.6 carrier checks inconsistent' },
  { aps: 2.7, notes: 'APS 2.7 quick interactions no discovery' },
  { aps: 2.8, notes: 'APS 2.8 still below goal again' },
  { aps: 2.9, notes: 'APS 2.9 slightly below 3.5 target' },
  { aps: 2.15, notes: 'APS 2.15 quiet during peak traffic' },
  { aps: 2.35, notes: 'APS 2.35 not exploring port paths' },
  { aps: 2.45, notes: 'APS 2.45 ending conversations too early' },
  { aps: 2.55, notes: 'APS 2.55 weak upgrade discovery' },
  { aps: 2.65, notes: 'APS 2.65 missing new-line opportunities' },
]

const WEAK_BEFORE = `Pre-Coaching Notes:
Alex — Low APS

Coaching Category:
Performance

Situation:
Alex, current metrics show: APS 2.4 (Needs Improvement vs >= 3.5).

Behavior:
Coaching focus: increasing attempts and tablet eligibility checks.

Impact:
When execution slips on what we track, it affects results.

Next Steps:
• Increase attempts this week
• Increase your attempts daily
• Monitor APS daily
• Target 3.5 APS and hit APS goal
• Check carrier eligibility on every customer

Manager Follow-Up:
Check in 5 days.`

const BANNED_IN_OUTPUT =
  /increase attempts|increase your attempts|improve attempts|APS goal|hit 3\.5 APS|target APS|increase APS count|carrier eligibility|check eligibility|monitor APS|tablet eligibility|current metrics show|metric-focused|port opportunities|port activations|port paths|\bports?\b/i

describe('APS operational language bank', () => {
  it('flags all hard-banned KPI phrases', () => {
    const violations = findApsPhraseViolations(
      'Increase attempts, increase your attempts, improve attempts, APS goal, hit 3.5 APS, target APS, increase APS count, carrier eligibility, check eligibility, monitor APS',
    )
    assert.ok(violations.length >= 8)
  })

  it('generates 15 Low APS outputs with no blacklist violations and 5 next steps', () => {
    for (const [i, c] of LOW_APS_CASES.entries()) {
      const payload = {
        employeeName: 'Alex Rivera',
        coachingReason: 'Low APS (Attempts Per Shift)',
        notes: `${c.notes} APS ${c.aps}`,
        mode: 'coaching',
        coachingWorkspace: 'mobile_sales',
        coachingType: 'mobile_expert',
        role: 'ME',
      }
      const raw = buildDeterministicCoachingForm(payload)
      const out = finalizeCoachingOutput(raw, payload.employeeName, payload)
      const apsVal = validateApsCoachingLanguage(out, payload)
      assert.equal(apsVal.ok, true, `case ${i} violations: ${apsVal.violations.join(', ')}`)
      assert.equal(countNextStepsBullets(out), 5, `case ${i} next steps count`)
      assert.doesNotMatch(out, BANNED_IN_OUTPUT, `case ${i} banned phrase leak`)
      for (const pattern of APS_PHRASE_BLACKLIST) {
        assert.doesNotMatch(out, pattern, `case ${i} matched ban: ${pattern}`)
      }
      assert.match(out, /traffic|opportunit|carrier|interaction|engage/i)
      assert.match(out, /engag|slow down|upgrade and new-line|activation opportunities/i)
      assert.doesNotMatch(out, /your APS is|goal is 3\.5|increase attempts/i)
    }
  })

  it('rewrites weak generic KPI draft into TL-style operational coaching', () => {
    const payload = {
      coachingReason: 'Low APS',
      notes: 'APS 2.4 below goal',
      mode: 'coaching',
      coachingWorkspace: 'mobile_sales',
      coachingType: 'mobile_expert',
      role: 'ME',
    }
    assert.match(WEAK_BEFORE, /increase attempts|carrier eligibility|current metrics show/i)
    const out = finalizeCoachingOutput(WEAK_BEFORE, 'Alex', payload)
    assert.doesNotMatch(out, BANNED_IN_OUTPUT)
    assert.match(out, /Engage more customers throughout the day/i)
    assert.match(out, /Fully work each customer interaction/i)
      assert.match(out, /engaging more customers|slowing down conversations|upgrade and new-line|activation opportunities/i)
      assert.doesNotMatch(out, /\bport\b|\bports\b|port opportunities|port activations/i)
    assert.doesNotMatch(out, /goal is 3\.5|APS target|increase attempts|checking carrier eligibility|maximize traffic|your APS is below|\bport\b|\bports\b/i)
    assert.equal(countNextStepsBullets(out), 5)
    const freq = analyzeApsPhraseFrequency(out)
    assert.equal(freq.length, 0, `residual banned frequency: ${JSON.stringify(freq)}`)
  })

})
