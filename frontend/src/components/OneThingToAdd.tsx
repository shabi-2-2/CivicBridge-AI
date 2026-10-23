import { useMemo } from 'react'

import { FIELD_HINTS, PRIORITY_META } from '../lib/analysisMeta'
import type { FieldDrafts } from '../lib/review'
import type {
  AnalysisResponse,
  FieldKey,
  MissingInformation,
} from '../services/analysisApi'

type OneThingToAddProps = {
  missing: MissingInformation[]
  readiness: AnalysisResponse['readiness']
  drafts: FieldDrafts
  onFieldChange: (key: FieldKey, value: string) => void
}

const LOCATION_KEYS: FieldKey[] = [
  'location.street_or_landmark',
  'location.city_or_district',
  'location.postal_code',
]

export function OneThingToAdd({
  missing,
  readiness,
  drafts,
  onFieldChange,
}: OneThingToAddProps) {
  const { primary, others } = useMemo(() => {
    if (missing.length === 0) {
      return { primary: null, others: [] }
    }

    // 1. Prefer blocking gaps matching missing items, prioritizing location fields
    const blockingItems = missing.filter(
      (item) =>
        item.priority === 'blocking' || readiness.blocking_gaps.includes(item.key),
    )
    const locationBlocking = blockingItems.find((item) =>
      LOCATION_KEYS.includes(item.key),
    )

    const selectedPrimary =
      locationBlocking ??
      blockingItems[0] ??
      missing.find((item) => item.priority === 'recommended') ??
      missing[0]

    const remaining = missing.filter((item) => item.key !== selectedPrimary.key)

    return { primary: selectedPrimary, others: remaining }
  }, [missing, readiness])

  if (!primary) {
    return null
  }

  const primaryValue = drafts[primary.key]?.value ?? ''
  const isAnswered = primaryValue.trim().length > 0
  const priority = PRIORITY_META[primary.priority]

  return (
    <section
      aria-labelledby="one-thing-title"
      className="rounded-2xl border-2 border-accent/30 bg-surface p-5 shadow-card sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
            1
          </span>
          <h3
            id="one-thing-title"
            className="font-display text-lg tracking-tight sm:text-xl"
          >
            One detail to add
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {isAnswered ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-800">
              Added to draft
            </span>
          ) : (
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${priority.badgeClass}`}
            >
              {priority.label}
            </span>
          )}
        </div>
      </div>

      <p className="mt-3 text-base font-medium text-ink sm:text-lg">
        {primary.question}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        {primary.reason}
      </p>

      <div className="mt-4">
        <label htmlFor={`one-thing-${primary.key}`} className="sr-only">
          Answer for {primary.label}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={`one-thing-${primary.key}`}
            type="text"
            value={primaryValue}
            onChange={(e) => onFieldChange(primary.key, e.target.value)}
            placeholder={
              FIELD_HINTS[primary.key] ?? 'Type your answer to include it in the report...'
            }
            className="flex-1 rounded-xl border border-line bg-paper/60 px-4 py-2.5 text-sm leading-relaxed text-ink placeholder:text-ink-soft/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
          />
        </div>
        {isAnswered ? (
          <p className="mt-2 text-[11px] text-accent-deep">
            Saved to your draft. You can also review or edit this under detailed fields.
          </p>
        ) : null}
      </div>

      {others.length > 0 ? (
        <details className="group mt-5 border-t border-line/80 pt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-accent-deep transition-colors hover:text-accent focus:outline-none">
            <span>More questions to consider ({others.length})</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-4 w-4 transition-transform group-open:rotate-180"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <div className="mt-3 space-y-3">
            {others.map((item) => {
              const val = drafts[item.key]?.value ?? ''
              const otherPriority = PRIORITY_META[item.priority]
              return (
                <div
                  key={item.key}
                  className="rounded-xl border border-line/60 bg-paper/40 p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-ink">{item.label}</p>
                    <span
                      className={`rounded-full border px-2 py-0.2 text-[9px] font-semibold uppercase tracking-[0.08em] ${otherPriority.badgeClass}`}
                    >
                      {otherPriority.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink">{item.question}</p>
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => onFieldChange(item.key, e.target.value)}
                    placeholder={
                      FIELD_HINTS[item.key] ?? 'Type answer...'
                    }
                    className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-ink-soft/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
                  />
                </div>
              )
            })}
          </div>
        </details>
      ) : null}
    </section>
  )
}
