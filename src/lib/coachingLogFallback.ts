import type { CoachingLogApiPayload } from '../types/coaching'
import { COACHING_FORM_SECTION_LABELS } from '../types/coaching'
import { formatPersonName, polishGeneratedCoachingForm } from '../../shared/coachingOutput.mjs'

function block(label: string, body: string) {
  return `${label}:\n${body.trim()}\n`
}

/** Short label for later sections — avoids repeating full coachingReason string. */
function topicShort(reason: string): string {
  const r = reason.toLowerCase()
  if (r.includes('postpaid')) return 'postpaid'
  if (r.includes('prepaid')) return 'prepaid'
  if (r.includes('warp')) return 'WARP'
  if (r.includes('accessory')) return 'accessories'
  if (r.includes('tpd') || r.includes('transaction')) return 'transaction pace'
  if (r.includes('aps')) return 'APS'
  if (r.includes('hpa')) return 'HPA'
  if (r.includes('mpt')) return 'MPT'
  return 'this area'
}

/** Offline form — matches server prompt per mode. */
export function getCoachingLogFallback(payload: CoachingLogApiPayload): string {
  const rawName = payload.employeeName
  const name = formatPersonName(rawName)
  const reason = payload.coachingReason.trim() || 'performance expectations'
  const notes = payload.notes.trim()
  const topic = topicShort(reason)
  const focus = reason.split(/[.,;]/)[0]?.trim() || reason
  const focusSentence = focus.endsWith('.') ? focus : `${focus}.`
  const mode = payload.mode === 'recognition' ? 'recognition' : 'coaching'

  let pre: string
  let category: string
  let situation: string
  let behavior: string
  let impact: string
  let nextSteps: string
  let followUp: string

  if (mode === 'recognition') {
    pre =
      topic === 'this area'
        ? `${name} — ${focusSentence}${notes ? ` ${notes}` : ''} Solid performance and strong effort on the floor.`
        : `${name} is showing solid performance on ${topic} with good progress and strong effort.${notes ? ` ${notes}` : ''}`

    category =
      topic === 'this area'
        ? `Recognition — ${focus}.`
        : `Recognition — strong execution on ${topic}.`

    situation =
      topic === 'this area'
        ? `${name} is showing solid performance and strong urgency on the floor.`
        : `${name} is showing solid performance and strong urgency on ${topic}.`

    behavior = notes
      ? `${name} is showing strong urgency and consistent engagement. ${notes} This is helping maintain steady performance and opens up more opportunities.`
      : topic === 'this area'
        ? `${name} is showing strong urgency on the floor and consistently engaging customers. That steady effort helps performance and creates more opportunities.`
        : `${name} brings strong ${topic} habits into live conversations—good engagement with customers and consistent effort.`

    impact =
      topic === 'this area'
        ? `This level of engagement supports overall store performance and helps maintain strong customer flow.`
        : `This supports overall store performance and team pace while setting a solid example on the floor.`

    nextSteps =
      topic === 'this area'
        ? `• Continue strong customer engagement\n• Maintain urgency throughout shifts\n• Keep building on current performance`
        : `• Continue strong customer engagement on ${topic}\n• Maintain urgency and consistency through shifts\n• Keep building on current performance`

    followUp =
      topic === 'this area'
        ? `Will continue to support and monitor consistency. Expect performance to remain strong.`
        : `Will continue to support and monitor consistency. Expect performance to remain strong on ${topic}.`
  } else {
    pre =
      topic === 'this area'
        ? `${name} — ${focusSentence}${notes ? ` ${notes}` : ''} Below goal, needs improvement.`
        : `${name} is below goal on ${topic} and not where we need them.${notes ? ` ${notes}` : ''}`

    category =
      topic === 'this area'
        ? `Performance — ${focus}.`
        : `Sales execution — ${topic} below standard.`

    situation =
      topic === 'this area'
        ? `${name} is below goal on what we track and not meeting expectations.`
        : `${name} is below goal in ${topic} and not meeting expectations.`

    behavior = notes
      ? `${notes} Not consistent on the floor. Missing opportunities to present offers and close.`
      : topic === 'this area'
        ? `Not consistently engaging customers. Missing opportunities to present offers and close.`
        : `Not consistently presenting ${topic} in conversations. Missing opportunities to present offers and close.`

    impact =
      topic === 'this area'
        ? `Missed sales and the store sits behind goal.`
        : `Missed sales on ${topic} and the store sits behind goal.`

    nextSteps =
      topic === 'this area'
        ? `• Increase customer engagement\n• Hit minimum activity expectations\n• Manager check-in mid-shift`
        : `• Increase customer engagement\n• Present ${topic} on qualified customers\n• Manager check-in mid-shift`

    followUp =
      topic === 'this area'
        ? `Follow up next visit. Expect improvement in overall activity and engagement.`
        : `Follow up next visit. Expect improvement in ${topic} and overall activity.`
  }

  const draft = [
    block(COACHING_FORM_SECTION_LABELS[0], pre),
    block(COACHING_FORM_SECTION_LABELS[1], category),
    block(COACHING_FORM_SECTION_LABELS[2], situation),
    block(COACHING_FORM_SECTION_LABELS[3], behavior),
    block(COACHING_FORM_SECTION_LABELS[4], impact),
    block(COACHING_FORM_SECTION_LABELS[5], nextSteps),
    block(COACHING_FORM_SECTION_LABELS[6], followUp),
  ].join('\n')

  return polishGeneratedCoachingForm(draft, rawName)
}
