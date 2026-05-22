import {
  countNextStepsBullets,
  enforceApsFiveNextStepsBullets,
  enforceFiveNextStepsBullets,
  MIN_COACHING_NEXT_STEPS_BULLETS,
} from './nextStepsNormalizer.mjs'
import { applyApsLanguageGuard } from './apsLanguageGuard.mjs'
import {
  forceScrubApsViolations,
  hasApsCoachingContext,
  validateApsCoachingLanguage,
} from './apsOperationalLanguage.mjs'
import { applyHpaLanguageGuard } from './hpaLanguageGuard.mjs'
import { applyWirelessRealismDialect } from './wirelessRealismDialect.mjs'
import { applyHumanCompression } from './humanCompression.mjs'
import { polishGeneratedCoachingForm } from './coachingOutput.mjs'

/**
 * @param {string} text
 * @param {{ mode?: string } | null | undefined} payload
 */
export function validateCoachingNextStepsContract(text, payload) {
  if ((payload?.mode || 'coaching') !== 'coaching') {
    return { ok: true, bulletCount: countNextStepsBullets(text), minRequired: MIN_COACHING_NEXT_STEPS_BULLETS }
  }
  const bulletCount = countNextStepsBullets(text)
  return {
    ok: bulletCount >= MIN_COACHING_NEXT_STEPS_BULLETS,
    bulletCount,
    minRequired: MIN_COACHING_NEXT_STEPS_BULLETS,
  }
}

/**
 * Post-process coaching output: polish, metric guards, realism, 5-bullet Next Steps.
 * APS operational guard runs in-band (no separate final sanitizer / hard-fail validation).
 * @param {string} raw
 * @param {string} rawName
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
export function finalizeCoachingOutput(raw, rawName, payload) {
  const polished = polishGeneratedCoachingForm(raw, rawName)
  const apsGuarded = applyApsLanguageGuard(polished, payload)
  const guarded = applyHpaLanguageGuard(apsGuarded, payload)
  const dialect = applyWirelessRealismDialect(guarded, payload)
  const compressed = applyHumanCompression(dialect, payload)
  let out = enforceFiveNextStepsBullets(compressed, payload)

  if ((payload?.mode || 'coaching') === 'coaching') {
    if (hasApsCoachingContext(payload)) {
      out = enforceApsFiveNextStepsBullets(out, payload)
    }
    if (countNextStepsBullets(out) < MIN_COACHING_NEXT_STEPS_BULLETS) {
      out = hasApsCoachingContext(payload)
        ? enforceApsFiveNextStepsBullets(out, payload)
        : enforceFiveNextStepsBullets(out, payload)
    }
    if (hasApsCoachingContext(payload)) {
      const apsValidation = validateApsCoachingLanguage(out, payload)
      if (!apsValidation.ok) {
        out = forceScrubApsViolations(out)
      }
      out = enforceApsFiveNextStepsBullets(out, payload)
    }
    const validation = validateCoachingNextStepsContract(out, payload)
    if (!validation.ok) {
      if (hasApsCoachingContext(payload)) {
        out = enforceApsFiveNextStepsBullets(out, payload)
      } else {
        out = enforceFiveNextStepsBullets(out, payload)
      }
      const retry = validateCoachingNextStepsContract(out, payload)
      if (!retry.ok) {
        const err = new Error('NEXT_STEPS_VALIDATION_FAILED')
        err.code = 'NEXT_STEPS_VALIDATION_FAILED'
        err.bulletCount = retry.bulletCount
        throw err
      }
    }
  }
  return out
}

/**
 * Enforce Next Steps contract on a single section body (refine_section).
 * @param {string} sectionBody
 * @param {Record<string, unknown>} payload
 */
export function finalizeNextStepsSectionBody(sectionBody, payload) {
  const wrapped = `Next Steps:\n${String(sectionBody ?? '').trim()}\n\nManager Follow-Up:\n`
  const expand = hasApsCoachingContext(payload)
    ? enforceApsFiveNextStepsBullets
    : enforceFiveNextStepsBullets
  let out = expand(wrapped, payload)
  if ((payload?.mode || 'coaching') === 'coaching') {
    if (countNextStepsBullets(out) < MIN_COACHING_NEXT_STEPS_BULLETS) {
      out = expand(out, payload)
    }
    if (hasApsCoachingContext(payload)) {
      out = enforceApsFiveNextStepsBullets(out, payload)
    }
    const validation = validateCoachingNextStepsContract(out, payload)
    if (!validation.ok) {
      out = expand(`Next Steps:\n\nManager Follow-Up:\n`, payload)
    }
  }
  const m = out.match(/Next Steps:\s*\n([\s\S]*?)(?=\n+Manager Follow-Up:|$)/i)
  return (m?.[1] ?? sectionBody).trim()
}
