import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCoachingLogMessages,
  buildRefineSectionPrompt,
  normalizeAiRouteAction,
} from './messages.mjs'

describe('normalizeAiRouteAction', () => {
  it('normalizes coaching_log variants', () => {
    assert.equal(normalizeAiRouteAction(' coaching_log '), 'coaching_log')
    assert.equal(normalizeAiRouteAction('COACHING LOG'), 'coaching_log')
  })

  it('normalizes refine_section variants', () => {
    assert.equal(normalizeAiRouteAction('refine section'), 'refine_section')
  })
})

describe('buildCoachingLogMessages', () => {
  it('returns mobile sales coaching messages for coaching mode', () => {
    const result = buildCoachingLogMessages('coaching_log', {
      employeeName: 'Alex',
      coachingReason: 'Late to shift',
      notes: 'Arrived 10 minutes late',
      mode: 'coaching',
      coachingWorkspace: 'mobile_sales',
    })
    assert.ok(result)
    assert.match(result.system, /Coaching Category/i)
    assert.match(result.user, /Late to shift/)
    assert.equal(result.coachingMeta?.issuePrimary, 'attendance')
  })

  it('returns null for non-coaching_log actions', () => {
    assert.equal(buildCoachingLogMessages('refine_section', {}), null)
  })

  it('injects OSL metric intelligence for mobile sales coaching metrics', () => {
    const result = buildCoachingLogMessages('coaching_log', {
      employeeName: 'Alex',
      coachingReason: 'Metric check',
      notes: 'APS 3.2, HPA 7.1, MPT 52',
      mode: 'coaching',
      coachingWorkspace: 'mobile_sales',
      coachingType: 'mobile_expert',
      role: 'ME',
    })
    assert.ok(result)
    assert.match(result.system, /MOBILE EXPERT METRIC INTELLIGENCE/i)
    assert.match(result.system, /APS: 3.2.*Needs Coaching/i)
    assert.match(result.system, /HPA: 7.1.*Needs Coaching/i)
    assert.match(result.system, /HPA goal: <= 6.0/i)
  })

  it('routes to general coaching context when role/coaching type are non-mobile', () => {
    const result = buildCoachingLogMessages('coaching_log', {
      employeeName: 'Alex',
      coachingReason: 'Leadership coaching conversation',
      notes: 'APS 3.2, HPA 7.1, MPT 52',
      mode: 'coaching',
      coachingWorkspace: 'mobile_sales',
      coachingType: 'leadership',
      role: 'manager',
    })
    assert.ok(result)
    assert.doesNotMatch(result.system, /MOBILE EXPERT METRIC INTELLIGENCE/i)
    assert.match(result.system, /General workplace/i)
  })

  it('does not inject metric upgrade when topic is non-wireless', () => {
    const result = buildCoachingLogMessages('coaching_log', {
      employeeName: 'Alex',
      coachingReason: 'Attendance follow-up',
      notes: 'Late to shift',
      mode: 'coaching',
      coachingWorkspace: 'mobile_sales',
      coachingType: 'mobile_expert',
      role: 'ME',
    })
    assert.ok(result)
    assert.doesNotMatch(result.system, /MOBILE EXPERT METRIC INTELLIGENCE/i)
  })

  it('injects positive metric intelligence in recognition mode for mobile expert metric topics', () => {
    const result = buildCoachingLogMessages('coaching_log', {
      employeeName: 'Alex',
      coachingReason: 'Great APS and HPA trend',
      notes: 'APS 4.1 HPA 5.6',
      mode: 'recognition',
      coachingWorkspace: 'mobile_sales',
      coachingType: 'mobile_expert',
      role: 'ME',
    })
    assert.ok(result)
    assert.match(result.system, /MOBILE EXPERT METRIC INTELLIGENCE/i)
    assert.match(result.system, /RECOGNITION UPGRADE/i)
  })
})

describe('buildRefineSectionPrompt', () => {
  it('includes section text and refinement directive', () => {
    const { system, user } = buildRefineSectionPrompt({
      sectionKey: 'Impact',
      sectionTitle: 'Impact',
      currentSectionText: 'Team coverage suffered.',
      fullGeneratedForm: 'Pre-Coaching Notes:\n...\n',
      refinementPreset: 'softer',
      refinementInstruction: '',
      mode: 'coaching',
      coachingWorkspace: 'mobile_sales',
      employeeName: 'Alex',
      coachingFor: 'Late to shift',
    })
    assert.match(system, /Rewrite ONLY/)
    assert.match(user, /Team coverage suffered/)
    assert.match(user, /REFINEMENT INSTRUCTION/)
  })
})
