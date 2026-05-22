import { buildRefinementDirective } from '../../shared/refineSectionPayload.mjs'
import {
  buildCoachingClassRules,
  classifyIssue,
  normalizeIssueText,
} from '../../shared/coachingIssueClassifier.mjs'
import { isLightReminderCoaching } from '../../shared/coachingReminderTone.mjs'
import {
  isWirelessSalesPerformanceTopic,
  shouldUseMobileExpertContext,
} from '../../shared/coachingContextRouting.mjs'
import { buildOslMetricPromptContext } from '../../shared/oslMetricIntelligence.mjs'
import {
  COACHING_PROMPT,
  COACHING_USER_PREFIX,
  GENERAL_COACHING_PROMPT,
  GENERAL_COACHING_USER_PREFIX,
  GENERAL_RECOGNITION_PROMPT,
  GENERAL_RECOGNITION_USER_PREFIX,
  MOBILE_EXPERT_METRIC_COACHING_UPGRADE,
  MOBILE_EXPERT_METRIC_RECOGNITION_UPGRADE,
  RECOGNITION_PROMPT,
  RECOGNITION_USER_PREFIX,
  REMINDER_COACHING_MODE,
} from '../prompts/coachingPrompts.mjs'

export function normalizeAiRouteAction(raw) {
  if (raw == null) return ''
  let s = typeof raw === 'string' ? raw.trim() : String(raw).trim()
  try {
    s = s.normalize('NFKC')
  } catch {
    /* ignore */
  }
  const lower = s.toLowerCase().replace(/\s+/g, '_')
  if (lower === 'coaching_log') return 'coaching_log'
  if (lower === 'refine_section') return 'refine_section'
  return s
}

export function buildRefineSectionPrompt(payload) {
  const directive = buildRefinementDirective(payload)
  const sectionLabel =
    payload.sectionName ||
    payload.sectionKey ||
    (typeof payload.sectionTitle === 'string' ? payload.sectionTitle.trim() : '') ||
    'Section'

  const general = payload.coachingWorkspace === 'general_workplace'
  const modeLine =
    payload.mode === 'recognition'
      ? general
        ? 'You refine ONE section of a workplace recognition / positive-feedback form.'
        : 'You refine ONE section of a retail recognition / positive-feedback form.'
      : general
        ? 'You refine ONE section of a workplace corrective coaching documentation form.'
        : 'You refine ONE section of a retail corrective coaching documentation form.'

  const coachingCtx =
    typeof payload.coachingFor === 'string' && payload.coachingFor.trim()
      ? `ORIGINAL COACHING TOPIC (stay on-topic): ${payload.coachingFor.trim()}\n\n`
      : ''

  const employeeLine =
    typeof payload.employeeName === 'string' && payload.employeeName.trim()
      ? `Employee name (use naturally): ${payload.employeeName.trim()}\n\n`
      : ''

  const nextStepsContract =
    payload.mode === 'coaching' && sectionLabel === 'Next Steps'
      ? '\nHARD REQUIREMENT: Output exactly 5 bullet lines (each starting with • or -). No fewer than 5. Operational floor actions only — no "increase attempts," "monitor APS," or robotic KPI phrasing.\n'
      : ''

  const system = `${modeLine}
Rewrite ONLY the section body below. Output plain text only — no section header line, no markdown fences, no quotes.
Preserve "- " bullets when the section uses bullets. Do not invent facts or HR processes.${nextStepsContract}`

  const user = `${employeeLine}${coachingCtx}SECTION KEY: ${payload.sectionKey || sectionLabel}
SECTION TITLE: ${payload.sectionTitle || sectionLabel}

FULL FORM (context only):
---
${payload.fullGeneratedForm}
---

SECTION TEXT TO REWRITE:
---
${payload.currentSectionText}
---

REFINEMENT INSTRUCTION:
${directive}

Reply with only the rewritten section body.`

  return { system, user }
}

/**
 * Coaching and recognition use two entirely separate system prompts and user preambles — no shared template.
 * @param {string} action
 * @param {object} payload
 * @returns {null | { system: string; user: string; coachingMeta: null | { issuePrimary: string; userBlob: string } }}
 */
export function buildCoachingLogMessages(action, payload) {
  if (action !== 'coaching_log') return null
  const mode = payload?.mode === 'recognition' ? 'recognition' : 'coaching'
  const workspace = payload?.coachingWorkspace === 'general_workplace' ? 'general_workplace' : 'mobile_sales'
  const useMobileExpertContext = workspace === 'mobile_sales' && shouldUseMobileExpertContext(payload)
  const effectiveWorkspace = useMobileExpertContext ? 'mobile_sales' : 'general_workplace'
  const wirelessPerformanceTopic =
    useMobileExpertContext && isWirelessSalesPerformanceTopic(payload)

  const blob = normalizeIssueText(`${payload?.coachingReason ?? ''} ${payload?.notes ?? ''}`)
  const { primary: issuePrimary } = classifyIssue(blob, mode)
  let topicGuide = buildCoachingClassRules(issuePrimary, mode)
  if (effectiveWorkspace === 'general_workplace') {
    topicGuide +=
      '\n\nWORKSPACE: General workplace. Avoid retail wireless jargon (APS/HPA/MPT, activations, postpaid, sales floor, Mobile Expert) and default sales KPIs unless the user explicitly used them.'
  }

  const reminderTone =
    mode === 'coaching' && isLightReminderCoaching(payload?.notes, payload?.coachingReason)
  const metricContext =
    wirelessPerformanceTopic
      ? buildOslMetricPromptContext(`${payload?.coachingReason ?? ''} ${payload?.notes ?? ''}`, { mode })
      : ''

  let systemPrompt
  if (mode === 'recognition') {
    systemPrompt =
      effectiveWorkspace === 'general_workplace'
        ? `${GENERAL_RECOGNITION_PROMPT}\n\nTOPIC GUIDE:\n${topicGuide}`
        : `${RECOGNITION_PROMPT}\n\nTOPIC GUIDE:\n${topicGuide}`
    if (metricContext) {
      systemPrompt += `\n\n${metricContext}\n\n${MOBILE_EXPERT_METRIC_RECOGNITION_UPGRADE}`
    }
  } else {
    systemPrompt =
      effectiveWorkspace === 'general_workplace'
        ? `${GENERAL_COACHING_PROMPT}\n\nTOPIC GUIDE (tone and boundaries—not a template to paste):\n${topicGuide}`
        : `${COACHING_PROMPT}\n\nTOPIC GUIDE (tone and boundaries—not a template to paste):\n${topicGuide}`
    if (metricContext) {
      systemPrompt += `\n\n${metricContext}\n\n${MOBILE_EXPERT_METRIC_COACHING_UPGRADE}`
    }
    if (reminderTone) {
      systemPrompt += `\n\n${REMINDER_COACHING_MODE}`
    }
  }

  let userPreamble
  if (mode === 'recognition') {
    userPreamble =
      effectiveWorkspace === 'general_workplace' ? GENERAL_RECOGNITION_USER_PREFIX : RECOGNITION_USER_PREFIX
  } else {
    userPreamble = effectiveWorkspace === 'general_workplace' ? GENERAL_COACHING_USER_PREFIX : COACHING_USER_PREFIX
  }

  const body = JSON.stringify(payload ?? {}, null, 2)
  const user =
    userPreamble +
    (mode === 'coaching'
      ? `ISSUE_TOPIC_HINT (for category/tone only; content must come from JSON): ${issuePrimary}\n` +
        (reminderTone
          ? 'REMINDER_MODE: true — notes/reason call for a light reminder (e.g. just a reminder, not serious, light coaching, no break schedule). Follow REMINDER_MODE at the end of the system message.\n'
          : '')
      : '') +
    'Copy-paste clean plain text. No fragments or cut-off endings.\n\n' +
    `JSON:\n${body}`

  return {
    system: systemPrompt,
    user,
    coachingMeta:
      mode === 'coaching' ? { issuePrimary, userBlob: blob } : null,
  }
}

