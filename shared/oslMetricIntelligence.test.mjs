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

  it('uses latest metric value and marks improving_but_below_goal trend', () => {
    const out = evaluateOslMetricIntelligence('Last week APS was 2.6 now APS is 3.3')
    assert.equal(out.metrics.aps?.value, 3.3)
    assert.equal(out.metrics.aps?.previousValue, 2.6)
    assert.equal(out.metrics.aps?.trendDirection, 'improving')
    assert.equal(out.trend.classification, 'improving_but_below_goal')
  })

  it('marks repeated issue trend when notes indicate recurrence', () => {
    const out = evaluateOslMetricIntelligence('APS 2.8 still below goal again after prior coaching')
    assert.equal(out.trend.classification, 'repeated_issue')
    assert.equal(out.trend.repeatedIssue, true)
  })

  it('defaults high HPA focus to postpaid opportunity and conversion coaching', () => {
    const out = evaluateOslMetricIntelligence('HPA 8.1 low postpaid output')
    const focus = out.metrics.hpa?.coachingFocus.join(' ') ?? ''
    assert.match(focus, /activations produced for hours worked|postpaid opportunities|carrier options|discovery/i)
    assert.doesNotMatch(
      focus,
      /slow transactions|paperwork|wait times|setup|between activations|activation flow|conversion habits|closing sales/i,
    )
  })

  it('only adds HPA speed coaching when explicit operational-delay notes exist', () => {
    const out = evaluateOslMetricIntelligence(
      'HPA 8.1 with slow transactions and paperwork delays causing long customer wait times',
    )
    const focus = out.metrics.hpa?.coachingFocus.join(' ') ?? ''
    assert.match(focus, /paperwork|wait delays|slow/i)
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

  it('frames APS as customer engagement and opportunity-creation coaching', () => {
    const out = evaluateOslMetricIntelligence('APS 2.4 below goal')
    const focus = out.metrics.aps?.coachingFocus.join(' ') ?? ''
    assert.match(focus, /Engage more customers|upgrade and new-line|activation opportunities/i)
    assert.doesNotMatch(focus, /\bport\b|\bports\b|port opportunities/i)
    assert.doesNotMatch(focus, /tablet eligibility|get customers to the tablet/i)
    assert.doesNotMatch(focus, /track attempts daily|customer service|increase attempts/i)
  })

  it('includes realistic field coaching language and 7-day action-plan guidance', () => {
    const ctx = buildOslMetricPromptContext('APS 2.5 HPA 7.8 MPT 49')
    assert.match(ctx, /engage more customers|fully work each customer interaction/i)
    const apsFocus = ctx.match(/- APS:[\s\S]*?(?=\n- HPA:|$)/)?.[0] ?? ''
    assert.match(apsFocus, /Explore upgrade and new-line opportunities/i)
    assert.doesNotMatch(apsFocus, /\bport\b|\bports\b|port opportunities|port activations/i)
    assert.doesNotMatch(apsFocus, /tablet eligibility|increase attempts|all available carriers|minimum APS target/i)
    assert.match(ctx, /HARD-BAN.*increase attempts/i)
    assert.match(ctx, /7-day action plan/i)
    assert.match(ctx, /Severity: Needs Improvement/i)
    assert.match(ctx, /Trend intelligence:/i)
    assert.match(ctx, /Behavior-aware strategy focus:/i)
    assert.match(ctx, /Metric separation: HPA = postpaid output pace for hours worked/i)
    const focusBlocks = ctx
      .split('\n')
      .filter((l) => /Coaching focus:|Combined coaching focus:/i.test(l))
      .join('\n')
    assert.doesNotMatch(
      focusBlocks,
      /lead qualification|workflow optimization|streamline operations|process efficiency|improving conversion habits|streamline your process|between postpaid activations|activation flow/i,
    )
  })
})
