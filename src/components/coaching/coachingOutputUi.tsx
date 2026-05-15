import { COACHING_FORM_SECTION_LABELS } from '../../types/coaching'
import type { RefinePreset } from '../../types/coaching'

/** Premium document headings (parsed section `id` matches model labels). */
const DOCUMENT_SECTION_DISPLAY: Record<string, string> = {
  'Pre-Coaching Notes': 'PRE-COACHING NOTES',
  'Coaching Category': 'COACHING CATEGORY',
  Situation: 'SITUATION',
  Behavior: 'BEHAVIOR',
  Impact: 'IMPACT',
  'Next Steps': 'NEXT STEPS',
  'Manager Follow-Up': 'MANAGER FOLLOW-UP',
  'Coaching form': 'COACHING FORM',
}

export function documentSectionTitle(sectionId: string): string {
  return DOCUMENT_SECTION_DISPLAY[sectionId] ?? sectionId.replace(/\s+/g, ' ').trim().toUpperCase()
}

export function formatGenerationBadgeLabel(
  ms: number,
  source: 'openai' | 'deterministic' | 'fallback' | null,
): string {
  if (source === 'openai' && ms < 1500) return 'Instant'
  const s = (ms / 1000).toFixed(1)
  return source === 'deterministic' ? `Prepared in ${s}s` : `Generated in ${s}s`
}

export function OutputNextStepsBody({ body }: { body: string }) {
  const raw = body.trim()
  if (!raw) {
    return <span className="output-doc-empty">—</span>
  }
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const items = lines
    .map((line) => line.replace(/^[•\-\*]\s*/, '').replace(/^\d+[.)]\s+/, '').trim())
    .filter(Boolean)
  if (items.length === 0) {
    return <div className="output-doc-text">{body}</div>
  }
  return (
    <ul className="output-doc-bullets">
      {items.map((text, i) => (
        <li key={i}>{text}</li>
      ))}
    </ul>
  )
}

export const REFINABLE_SECTION_IDS = new Set<string>(COACHING_FORM_SECTION_LABELS)

export const REFINE_QUICK_OPTIONS: { preset: RefinePreset; label: string }[] = [
  { preset: 'softer', label: 'Make softer' },
  { preset: 'more_direct', label: 'Make more direct' },
  { preset: 'professional', label: 'Make more professional' },
  { preset: 'shorten', label: 'Shorten' },
  { preset: 'expand', label: 'Expand' },
  { preset: 'clearer_expectations', label: 'Clearer expectations' },
]

export function SectionCopyIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg className="btn-section-copy-icon-svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <path
          fill="currentColor"
          d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06l2.72 2.72 6.72-6.72a.75.75 0 0 1 1.06 0z"
        />
      </svg>
    )
  }
  return (
    <svg className="btn-section-copy-icon-svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path
        fill="currentColor"
        d="M4 2h7a2 2 0 0 1 2 2v7h-1.5V4a.5.5 0 0 0-.5-.5H4V2zm-2 2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 1.5a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V6a.5.5 0 0 0-.5-.5H2z"
      />
    </svg>
  )
}
