import { evaluateOslMetricIntelligence } from './oslMetricIntelligence.mjs'

/**
 * @param {{ coachingReason?: string; notes?: string }} payload
 */
export function buildMetricSnapshot(payload) {
  const text = `${payload?.coachingReason ?? ''} ${payload?.notes ?? ''}`
  const intel = evaluateOslMetricIntelligence(text, 'coaching')
  const metricKeys = /** @type {const} */ (['aps', 'hpa', 'mpt'])
  /** @type {Record<string, { value: number; status: string; severity: string }>} */
  const snapshot = {}
  for (const key of metricKeys) {
    const m = intel.metrics[key]
    if (!m) continue
    snapshot[key] = {
      value: m.value,
      status: m.status,
      severity: m.severityLabel,
    }
  }
  return snapshot
}

/**
 * @param {Array<{ event_name: string; metadata?: Record<string, unknown>; created_at: string }>} events
 * @param {Date} [now]
 */
export function buildRoiInsights(events, now = new Date()) {
  const generated = events.filter((e) => e.event_name === 'coaching_log_generated')
  const completedFollowUps = events.filter((e) => e.event_name === 'coaching_followup_completed')
  const nowMs = now.getTime()

  /** @type {Array<{at: string; value: number}>} */
  const apsSeries = []
  /** @type {Array<{at: string; value: number}>} */
  const hpaSeries = []
  /** @type {Array<{at: string; value: number}>} */
  const mptSeries = []
  /** @type {Record<string, number>} */
  const metricFocusCounts = { aps: 0, hpa: 0, mpt: 0 }
  /** @type {Map<string, { dueAt: string; completed: boolean }>} */
  const followUpByRep = new Map()

  for (const e of generated) {
    const md = e.metadata && typeof e.metadata === 'object' ? e.metadata : {}
    const metricSnapshot = md.metricSnapshot && typeof md.metricSnapshot === 'object' ? md.metricSnapshot : null
    if (metricSnapshot) {
      const aps = metricSnapshot.aps
      const hpa = metricSnapshot.hpa
      const mpt = metricSnapshot.mpt
      if (aps && typeof aps === 'object' && Number.isFinite(Number(aps.value))) {
        apsSeries.push({ at: e.created_at, value: Number(aps.value) })
      }
      if (hpa && typeof hpa === 'object' && Number.isFinite(Number(hpa.value))) {
        hpaSeries.push({ at: e.created_at, value: Number(hpa.value) })
      }
      if (mpt && typeof mpt === 'object' && Number.isFinite(Number(mpt.value))) {
        mptSeries.push({ at: e.created_at, value: Number(mpt.value) })
      }
    }
    const focus = String(md.metricFocus ?? '').toLowerCase()
    if (focus === 'aps' || focus === 'hpa' || focus === 'mpt') {
      metricFocusCounts[focus] += 1
    }
    const rep = String(md.employeeName ?? '').trim().toLowerCase()
    const dueAt = typeof md.followUpDueAt === 'string' ? md.followUpDueAt : ''
    if (rep && dueAt) {
      followUpByRep.set(rep, { dueAt, completed: false })
    }
  }

  for (const e of completedFollowUps) {
    const md = e.metadata && typeof e.metadata === 'object' ? e.metadata : {}
    const rep = String(md.employeeName ?? '').trim().toLowerCase()
    if (!rep) continue
    const existing = followUpByRep.get(rep)
    if (existing) {
      followUpByRep.set(rep, { ...existing, completed: true })
    }
  }

  const dueFollowUps = Array.from(followUpByRep.values()).filter((f) => {
    const ts = Date.parse(f.dueAt)
    return Number.isFinite(ts) && ts <= nowMs
  })
  const completedDueFollowUps = dueFollowUps.filter((f) => f.completed)
  const coachingCompletionRate =
    dueFollowUps.length > 0 ? Math.round((completedDueFollowUps.length / dueFollowUps.length) * 100) : null

  const mostCoachedMetric = Object.entries(metricFocusCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  /**
   * @param {Array<{at: string; value: number}>} series
   */
  function movement(series) {
    if (series.length < 2) return null
    return {
      before: series[0].value,
      latest: series[series.length - 1].value,
      delta: Number((series[series.length - 1].value - series[0].value).toFixed(2)),
    }
  }

  return {
    formsGenerated: generated.length,
    coachingCompletionRate,
    repsNeedingFollowUp: dueFollowUps.filter((f) => !f.completed).length,
    mostCoachedMetric,
    apsTrend: apsSeries,
    hpaTrend: hpaSeries,
    mptTrend: mptSeries,
    beforeAfter: {
      aps: movement(apsSeries),
      hpa: movement(hpaSeries),
      mpt: movement(mptSeries),
    },
  }
}

