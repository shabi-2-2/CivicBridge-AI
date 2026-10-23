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
  const status = STATUS_META[field.status]
  const label = FIELD_LABELS[field.key]
  const originalValue = field.value ?? ''
  const reviewBadge = draft.edited
    ? 'Edited by you'
    : draft.confirmedByUser
      ? 'Reviewed by you'
      : null

  return (
    <article className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-ink">{label}</h4>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-soft/75">
            {field.key}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {reviewBadge ? (
            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-sky-900">
              {reviewBadge}
            </span>
          ) : null}
          <span
            className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${status.badgeClass}`}
          >
            {status.label}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        <textarea
          id={inputId}
          value={draft.value}
          onChange={(event) => onChange(event.target.value)}
          rows={draft.value.length > 160 ? 4 : 2}
          maxLength={600}
          placeholder={
            field.status === 'missing'
              ? `Not provided. ${FIELD_HINTS[field.key]}`
              : FIELD_HINTS[field.key]
          }
          className="w-full resize-y rounded-lg border border-line bg-paper/55 px-3 py-2.5 text-sm leading-relaxed text-ink placeholder:text-ink-soft/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
        />
      </div>

      <p id={`${inputId}-status`} className="mt-2 text-xs text-ink-soft">
        {status.description}
      </p>

      {draft.edited ? (
        <div className="mt-3 rounded-lg border border-line bg-paper/60 p-3">
          <p className="text-xs leading-relaxed text-ink-soft">
            <span className="font-semibold text-ink">AI original:</span>{' '}
            {originalValue || 'No value was provided.'}
          </p>
          <button
            type="button"
            onClick={onReset}
            className="mt-2 text-xs font-semibold text-accent-deep underline-offset-2 hover:underline"
          >
            Restore AI value
          </button>
        </div>
      ) : null}

      {field.evidence_quote ? (
        <blockquote className="mt-3 border-l-2 border-accent/40 pl-3">
          <p className="text-sm italic leading-relaxed text-ink">
            “{field.evidence_quote}”
          </p>
          <footer className="mt-1 text-[11px] text-ink-soft">
            Matched against the words you submitted. Matching a quote does not
            prove the real-world claim.
          </footer>
        </blockquote>
      ) : null}

      {field.rationale ? (
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          <span className="font-semibold text-ink">AI rationale:</span>{' '}
          {field.rationale}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line/80 pt-3">
        <span className="text-[11px] text-ink-soft">
          {formatConfidence(field.confidence)}
        </span>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-soft">
          <input
            type="checkbox"
            checked={draft.confirmedByUser}
            onChange={onToggleReviewed}
            className="h-4 w-4 rounded border-line text-accent focus:ring-accent/30"
          />
          Reviewed by me
        </label>
      </div>
    </article>
  )
}
