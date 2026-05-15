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
