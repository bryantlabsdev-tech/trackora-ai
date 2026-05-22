import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildMetricSnapshot, buildRoiInsights } from './managerRoi.mjs'

describe('buildMetricSnapshot', () => {
  it('extracts APS/HPA/MPT values when present', () => {
    const snap = buildMetricSnapshot({ coachingReason: 'Metrics', notes: 'APS 2.5 HPA 7.8 MPT 49' })
    assert.equal(snap.aps?.value, 2.5)
    assert.equal(snap.hpa?.value, 7.8)
    assert.equal(snap.mpt?.value, 49)
  })

  it('returns empty snapshot when metrics absent', () => {
    const snap = buildMetricSnapshot({ coachingReason: 'Attendance', notes: 'Late to shift' })
    assert.equal(Object.keys(snap).length, 0)
  })
})

describe('buildRoiInsights', () => {
  it('builds trends and before/after movement', () => {
    const events = [
      {
        event_name: 'coaching_log_generated',
        created_at: '2026-05-01T10:00:00.000Z',
        metadata: {
          metricSnapshot: { aps: { value: 2.1 }, hpa: { value: 8.1 } },
          metricFocus: 'aps',
          employeeName: 'Alex',
          followUpDueAt: '2026-05-05T10:00:00.000Z',
        },
      },
      {
        event_name: 'coaching_log_generated',
        created_at: '2026-05-10T10:00:00.000Z',
        metadata: {
          metricSnapshot: { aps: { value: 3.2 }, hpa: { value: 6.8 }, mpt: { value: 46 } },
          metricFocus: 'hpa',
          employeeName: 'Alex',
          followUpDueAt: '2026-05-15T10:00:00.000Z',
        },
      },
    ]
    const out = buildRoiInsights(events, new Date('2026-05-20T10:00:00.000Z'))
    assert.equal(out.formsGenerated, 2)
    assert.equal(out.mostCoachedMetric, 'aps')
    assert.equal(out.beforeAfter.aps?.before, 2.1)
    assert.equal(out.beforeAfter.aps?.latest, 3.2)
    assert.equal(out.repsNeedingFollowUp, 1)
  })
})

