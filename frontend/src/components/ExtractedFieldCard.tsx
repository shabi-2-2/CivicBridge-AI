import {
  FIELD_HINTS,
  FIELD_LABELS,
  STATUS_META,
  formatConfidence,
} from '../lib/analysisMeta'
import type { FieldDraft } from '../lib/review'
import type { ExtractedField } from '../services/analysisApi'

type ExtractedFieldCardProps = {
  field: ExtractedField
  draft: FieldDraft
  onChange: (value: string) => void
  onToggleReviewed: () => void
  onReset: () => void
}

export function ExtractedFieldCard({
  field,
  draft,
  onChange,
  onToggleReviewed,
  onReset,
}: ExtractedFieldCardProps) {
  const inputId = `field-${field.key.replaceAll('.', '-')}`
  const label = FIELD_LABELS[field.key]
  const originalValue = field.value ?? ''

  // Provenance / review badge selection
  let provenanceLabel: string
  let provenanceClass: string

  if (draft.edited) {
    provenanceLabel = 'Edited by you'
    provenanceClass = 'border-sky-200 bg-sky-50 text-sky-900'
  } else if (draft.confirmedByUser) {
    provenanceLabel = 'Confirmed by you'
    provenanceClass = 'border-emerald-200 bg-emerald-50 text-emerald-800'
  } else if (field.status === 'provided') {
    provenanceLabel = 'You said'
    provenanceClass = STATUS_META.provided.badgeClass
  } else if (field.status === 'inferred') {
    provenanceLabel = 'AI inferred'
    provenanceClass = STATUS_META.inferred.badgeClass
  } else if (field.status === 'conflicting') {
    provenanceLabel = 'Conflicting'
    provenanceClass = STATUS_META.conflicting.badgeClass
  } else {
    provenanceLabel = 'Missing'
    provenanceClass = STATUS_META.missing.badgeClass
  }

  const isConflicting = field.status === 'conflicting'

  return (
    <details
      className="group rounded-xl border border-line bg-surface p-3.5 transition-colors open:bg-surface open:shadow-xs hover:border-accent/40"
      open={isConflicting || undefined}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 focus:outline-none">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="text-sm font-semibold text-ink">{label}</span>
          <span className="hidden truncate text-xs text-ink-soft sm:inline sm:max-w-xs md:max-w-sm">
            {draft.value ? (
              draft.value
            ) : (
              <span className="italic opacity-60">Not provided</span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${provenanceClass}`}
          >
            {provenanceLabel}
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-4 w-4 text-ink-soft transition-transform group-open:rotate-180"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </summary>

      <div className="mt-3.5 border-t border-line/60 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor={inputId} className="text-xs font-semibold text-ink">
            {label}
          </label>
          <span className="text-[11px] text-ink-soft">
            {formatConfidence(field.confidence)}
          </span>
        </div>

        <textarea
          id={inputId}
          aria-label={label}
          value={draft.value}
          onChange={(event) => onChange(event.target.value)}
          rows={draft.value.length > 160 ? 3 : 2}
          maxLength={600}
          placeholder={
            field.status === 'missing'
              ? `Not provided. ${FIELD_HINTS[field.key]}`
              : FIELD_HINTS[field.key]
          }
          className="w-full resize-y rounded-lg border border-line bg-paper/55 px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-soft/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
        />

        {draft.edited ? (
          <div className="mt-2.5 rounded-lg border border-line bg-paper/60 p-2.5">
            <p className="text-xs leading-relaxed text-ink-soft">
              <span className="font-semibold text-ink">AI original:</span>{' '}
              {originalValue || 'No value was provided.'}
            </p>
            <button
              type="button"
              onClick={onReset}
              className="mt-1.5 text-xs font-semibold text-accent-deep underline-offset-2 hover:underline"
            >
              Restore AI value
            </button>
          </div>
        ) : null}

        {field.evidence_quote ? (
          <blockquote className="mt-2.5 border-l-2 border-accent/40 pl-3">
            <p className="text-xs italic leading-relaxed text-ink">
              “{field.evidence_quote}”
            </p>
            <footer className="mt-0.5 text-[10px] text-ink-soft">
              Matched from submitted text.
            </footer>
          </blockquote>
        ) : null}

        {field.rationale ? (
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            <span className="font-semibold text-ink">AI rationale:</span>{' '}
            {field.rationale}
          </p>
        ) : null}

        <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5">
          <p className="text-[11px] text-ink-soft">
            {STATUS_META[field.status].description}
          </p>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-soft">
            <input
              type="checkbox"
              checked={draft.confirmedByUser}
              onChange={onToggleReviewed}
              className="h-3.5 w-3.5 rounded border-line text-accent focus:ring-accent/30"
            />
            Reviewed by me
          </label>
        </div>
      </div>
    </details>
  )
}
