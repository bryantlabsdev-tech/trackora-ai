import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOslMetricPromptContext,
  evaluateOslMetricIntelligence,
} from './oslMetricIntelligence.mjs'

describe('evaluateOslMetricIntelligence', () => {
  it('scores APS/HPA/MPT against correct benchmark directions', () => {
    const out = evaluateOslMetricIntelligence('APS 3.4 HPA 5.9 MPT 50')
    assert.equal(out.metrics.aps?.status, 'needs_coaching')
    assert.equal(out.metrics.hpa?.status, 'on_track')
    assert.equal(out.metrics.mpt?.status, 'needs_coaching')
  })

  it('detects low APS + high HPA combined signal', () => {
    const out = evaluateOslMetricIntelligence('APS: 2.7, HPA: 8.4')
    assert.equal(out.combinedInsight?.label, 'Low APS + High HPA')
    assert.match(String(out.combinedInsight?.diagnosis), /not creating enough opportunities/i)
  })

  it('applies severity tiers for APS/HPA/MPT', () => {
    const out = evaluateOslMetricIntelligence('APS 2.5 HPA 7.8 MPT 49')
    assert.equal(out.metrics.aps?.severityLabel, 'Needs Improvement')
    assert.equal(out.metrics.hpa?.severityLabel, 'Needs Improvement')
    assert.equal(out.metrics.mpt?.severityLabel, 'Slightly Above Goal')
  })

  it('detects high MPT + low APS signal', () => {
    const out = evaluateOslMetricIntelligence('APS 2.6 MPT 62')
    assert.equal(out.combinedInsight?.label, 'High MPT + Low APS')
  })
})

describe('buildOslMetricPromptContext', () => {
  it('returns empty when no metrics are present', () => {
    assert.equal(buildOslMetricPromptContext('Attendance coaching only'), '')
  })

  it('renders benchmark context and HPA lower-is-better guidance', () => {
    const ctx = buildOslMetricPromptContext('APS 4.0 HPA 6.2')
    assert.match(ctx, /APS goal: >= 3.5/i)
    assert.match(ctx, /HPA goal: <= 6.0/i)
    assert.match(ctx, /HPA: 6.2.*Needs Coaching/i)
  })

  it('includes realistic field coaching language and 7-day action-plan guidance', () => {
    const ctx = buildOslMetricPromptContext('APS 2.5 HPA 7.8 MPT 49')
    assert.match(ctx, /get customers to the tablet/i)
    assert.match(ctx, /7-day action plan/i)
    assert.match(ctx, /Severity: Needs Improvement/i)
  })
})
