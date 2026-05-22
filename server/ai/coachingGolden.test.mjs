import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildCoachingLogMessages } from './messages.mjs'

function buildPayload(overrides = {}) {
  return {
    employeeName: 'Alex',
    coachingWorkspace: 'mobile_sales',
    coachingType: 'mobile_expert',
    role: 'ME',
    mode: 'coaching',
    coachingReason: 'Wireless sales performance coaching',
    notes: '',
    ...overrides,
  }
}

describe('golden mobile expert metric prompt routing', () => {
  it('handles missing metrics without metric intelligence block', () => {
    const result = buildCoachingLogMessages('coaching_log', buildPayload({ notes: 'Needs better customer engagement' }))
    assert.ok(result)
    assert.doesNotMatch(result.system, /MOBILE EXPERT METRIC INTELLIGENCE/i)
  })

  it('handles single metric APS and includes benchmark', () => {
    const result = buildCoachingLogMessages('coaching_log', buildPayload({ notes: 'APS 2.9 low attempts' }))
    assert.ok(result)
    assert.match(result.system, /APS: 2.9/i)
    assert.match(result.system, /APS goal: >= 3.5/i)
  })

  it('handles all metrics good', () => {
    const result = buildCoachingLogMessages('coaching_log', buildPayload({ notes: 'APS 4.0 HPA 5.8 MPT 42' }))
    assert.ok(result)
    assert.match(result.system, /APS: 4.*On Track/i)
    assert.match(result.system, /HPA: 5.8.*On Track/i)
    assert.match(result.system, /MPT: 42.*On Track/i)
  })

  it('handles all metrics bad and shows combined signal', () => {
    const result = buildCoachingLogMessages('coaching_log', buildPayload({ notes: 'APS 2.1 HPA 9.5 MPT 74' }))
    assert.ok(result)
    assert.match(result.system, /Needs Coaching/i)
    assert.match(result.system, /Combined metric signal/i)
  })

  it('handles mixed performance with nuanced severity', () => {
    const result = buildCoachingLogMessages('coaching_log', buildPayload({ notes: 'APS 2.5 HPA 7.8 MPT 49' }))
    assert.ok(result)
    assert.match(result.system, /Severity: Needs Improvement/i)
    assert.match(result.system, /Severity: Slightly Above Goal/i)
    assert.match(result.system, /Metric separation: HPA = postpaid output pace for hours worked/i)
  })

  it('routes high HPA toward production and conversion coaching by default', () => {
    const result = buildCoachingLogMessages(
      'coaching_log',
      buildPayload({ notes: 'HPA 8.2 low postpaid production this week' }),
    )
    assert.ok(result)
    assert.match(result.system, /not enough postpaid activations for hours worked/i)
    assert.match(result.system, /not automatically activation-speed issues/i)
    assert.doesNotMatch(result.system, /taking too long to complete activations/i)
    assert.match(result.system, /Vocabulary normalization:/i)
    assert.match(result.system, /Only discuss activation\/process-speed delays for HPA when notes explicitly describe/i)
  })
})

describe('golden general workplace isolation', () => {
  it('does not apply APS/HPA/MPT intelligence in general workplace coaching', () => {
    const result = buildCoachingLogMessages(
      'coaching_log',
      buildPayload({
        coachingWorkspace: 'general_workplace',
        coachingType: 'general_workplace',
        role: 'team_member',
        coachingReason: 'Attendance and communication',
        notes: 'APS 2.5 HPA 7.8 MPT 49',
      }),
    )
    assert.ok(result)
    assert.match(result.system, /General workplace/i)
    assert.doesNotMatch(result.system, /MOBILE EXPERT METRIC INTELLIGENCE/i)
  })
})

