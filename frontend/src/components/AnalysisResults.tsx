import { useEffect, useRef } from 'react'

import {
  CATEGORY_LABELS,
  CHANNEL_LABELS,
  FIELD_LABELS,
  PRIORITY_META,
  REVIEW_SEVERITY_META,
  SEVERITY_META,
  formatConfidence,
  formatTimestamp,
} from '../lib/analysisMeta'
import type { FieldDrafts } from '../lib/review'
import {
  FIELD_KEYS,
  type AnalysisResponse,
  type FieldKey,
} from '../services/analysisApi'
import { ExtractedFieldCard } from './ExtractedFieldCard'
import { ReviewDraft } from './ReviewDraft'

type AnalysisResultsProps = {
  analysis: AnalysisResponse
  drafts: FieldDrafts
  onFieldChange: (key: FieldKey, value: string) => void
  onToggleFieldReviewed: (key: FieldKey) => void
  onResetField: (key: FieldKey) => void
}

function EmptyListNote({ children }: { children: string }) {
  return (
    <p className="rounded-xl border border-dashed border-line bg-paper/45 px-4 py-3 text-sm text-ink-soft">
      {children}
    </p>
  )
}

export function AnalysisResults({
  analysis,
  drafts,
  onFieldChange,
  onToggleFieldReviewed,
  onResetField,
}: AnalysisResultsProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const severity = SEVERITY_META[analysis.issue.severity_suggestion]

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    headingRef.current?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'start',
    })
  }, [])

  return (
    <section id="results" aria-labelledby="analysis-title" className="scroll-mt-8">
      {analysis.emergency.triggered ? (
        <div
          role="alert"
          className="mb-6 rounded-2xl border-2 border-red-300 bg-red-50 p-5 sm:p-6"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-800">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M12 3 2.8 20h18.4L12 3z" />
                <path d="M12 9v5M12 17.5v.5" />
              </svg>
            </span>
            <div>
              <h2 className="font-display text-xl tracking-tight text-red-950">
                Possible immediate hazard
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-red-900">
                {analysis.emergency.message ??
                  'A possible immediate hazard was detected in this description.'}
              </p>
              {analysis.emergency.matched_rules.length > 0 ? (
                <p className="mt-2 text-xs text-red-900/80">
                  <span className="font-semibold">Safety rule matched:</span>{' '}
                  {analysis.emergency.matched_rules.join(', ')}
                </p>
              ) : null}
              <p className="mt-3 text-xs font-medium leading-relaxed text-red-950">
                CivicBridge AI has not contacted emergency services. This warning
                is based on the words in the complaint, not a safety assessment.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-6">
          <header className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-accent/20 bg-accent-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-deep">
                {CATEGORY_LABELS[analysis.issue.category]}
              </span>
              <span className="rounded-full border border-amber/20 bg-amber-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber">
                AI-assisted draft
              </span>
            </div>

            <h2
              ref={headingRef}
              id="analysis-title"
              tabIndex={-1}
              className="mt-4 font-display text-3xl leading-tight tracking-tight focus:outline-none sm:text-4xl"
            >
              {analysis.issue.title}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-soft sm:text-base">
              {analysis.issue.summary}
            </p>

            <div className={`mt-5 rounded-xl border p-4 ${severity.panelClass}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em]">
                  Suggested severity
                </span>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${severity.badgeClass}`}
                >
                  {severity.label}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed">
                {analysis.issue.severity_rationale}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed opacity-80">
                A tentative AI suggestion. It is not an official severity
                assessment.
              </p>
            </div>

            <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-ink-soft">
              {analysis.meta.disclaimer}
            </p>
          </header>

          <section
            aria-labelledby="fields-title"
            className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 id="fields-title" className="font-display text-xl tracking-tight">
                  Extracted fields
                </h3>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-soft">
                  Compare each label with your complaint, correct the value, and
                  tick “Reviewed by me” when it is ready. Edits are kept in this
                  browser only.
                </p>
              </div>
              <span className="rounded-full border border-line bg-paper-deep px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                {FIELD_KEYS.length} fields
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {FIELD_KEYS.map((key) => (
                <ExtractedFieldCard
                  key={key}
                  field={analysis.fields[key]}
                  draft={drafts[key]}
                  onChange={(value) => onFieldChange(key, value)}
                  onToggleReviewed={() => onToggleFieldReviewed(key)}
                  onReset={() => onResetField(key)}
                />
              ))}
            </div>
          </section>

          <section
            aria-labelledby="inferences-title"
            className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
          >
            <h3 id="inferences-title" className="font-display text-xl tracking-tight">
              AI inferences
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              Interpretations that were not stated word-for-word in your complaint.
            </p>

            {analysis.inferences.length === 0 ? (
              <div className="mt-4">
                <EmptyListNote>No separate inferences were generated.</EmptyListNote>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {analysis.inferences.map((inference, index) => (
                  <li
                    key={`${inference.statement}-${index}`}
                    className="rounded-xl border border-amber/20 bg-amber-soft/45 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="rounded-full border border-amber/20 bg-surface/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber">
                        Inference
                      </span>
                      <span className="text-[11px] text-ink-soft">
                        {formatConfidence(inference.confidence)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-ink">
                      {inference.statement}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                      <span className="font-semibold text-ink">Basis:</span>{' '}
                      {inference.basis}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                      <span className="font-semibold text-ink">Risk if wrong:</span>{' '}
                      {inference.risk_if_wrong}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            aria-labelledby="missing-title"
            className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
          >
            <h3 id="missing-title" className="font-display text-xl tracking-tight">
              Missing information
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              Questions generated from the category checklist, not invented by the
              model.
            </p>

            {analysis.missing_information.length === 0 ? (
              <div className="mt-4">
                <EmptyListNote>
                  The category checklist has no unanswered fields.
                </EmptyListNote>
              </div>
            ) : (
              <ol className="mt-4 space-y-3">
                {analysis.missing_information.map((item) => {
                  const priority = PRIORITY_META[item.priority]
                  return (
                    <li
                      key={item.key}
                      className="rounded-xl border border-line bg-paper/45 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-ink">{item.label}</p>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${priority.badgeClass}`}
                        >
                          {priority.label}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-ink">{item.question}</p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                        {item.reason}
                      </p>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          <section
            aria-labelledby="flags-title"
            className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
          >
            <h3 id="flags-title" className="font-display text-xl tracking-tight">
              Review flags
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              Deterministic checks for conflicts, unverified quotes and low-confidence
              inferences.
            </p>

            {analysis.review_flags.length === 0 ? (
              <div className="mt-4">
                <EmptyListNote>
                  No automated review flags were raised. Continue checking the
                  fields manually.
                </EmptyListNote>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {analysis.review_flags.map((flag, index) => {
                  const severity = REVIEW_SEVERITY_META[flag.severity]
                  return (
                    <li
                      key={`${flag.code}-${flag.field_key ?? 'general'}-${index}`}
                      className={`rounded-xl border p-4 ${severity.panelClass}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-current/20 bg-surface/55 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]">
                          {severity.label}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.08em] opacity-75">
                          {flag.code}
                        </span>
                        {flag.field_key ? (
                          <span className="text-[11px] font-medium opacity-80">
                            {FIELD_LABELS[flag.field_key]}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-relaxed">{flag.message}</p>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section
            aria-labelledby="steps-title"
            className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
          >
            <h3 id="steps-title" className="font-display text-xl tracking-tight">
              Suggested next steps
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              Generic guidance only. CivicBridge AI does not contact agencies for
              you.
            </p>
            {analysis.suggested_next_steps.length === 0 ? (
              <div className="mt-4">
                <EmptyListNote>No next steps were generated.</EmptyListNote>
              </div>
            ) : (
              <ol className="mt-4 space-y-3">
                {analysis.suggested_next_steps.map((step) => (
                  <li key={step.order} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-deep">
                      {step.order}
                    </span>
                    <div>
                      <p className="text-sm leading-relaxed text-ink">
                        {step.action}
                      </p>
                      <p className="mt-1 text-[11px] text-ink-soft">
                        {CHANNEL_LABELS[step.channel]}
                        {step.is_generic_guidance ? ' · Generic guidance' : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <ReviewDraft analysis={analysis} drafts={drafts} />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6">
          <section
            aria-labelledby="readiness-title"
            className="rounded-2xl border border-line bg-surface p-5 shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="readiness-title" className="font-display text-lg tracking-tight">
                  {analysis.readiness.label}
                </h3>
                <p className="mt-1 text-[11px] uppercase tracking-[0.1em] text-ink-soft">
                  Weighted completeness
                </p>
              </div>
              <span className="font-display text-3xl tracking-tight text-accent-deep">
                {analysis.readiness.score}%
              </span>
            </div>

            <div
              role="progressbar"
              aria-labelledby="readiness-title"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={analysis.readiness.score}
              className="mt-4 h-2.5 overflow-hidden rounded-full bg-paper-deep"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width]"
                style={{ width: `${analysis.readiness.score}%` }}
              />
            </div>

            <p className="mt-3 text-xs leading-relaxed text-ink-soft">
              {analysis.readiness.note}
            </p>
            <p className="mt-2 text-[11px] text-ink-soft">
              {analysis.readiness.filled_weight} of {analysis.readiness.total_weight}{' '}
              weighted points filled.
            </p>
            {analysis.readiness.conflict_cap_applied ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-relaxed text-red-900">
                Capped at 80 while conflicting information remains.
              </p>
            ) : null}
            {analysis.readiness.blocking_gaps.length > 0 ? (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                  Blocking gaps
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {analysis.readiness.blocking_gaps.map((key) => (
                    <li
                      key={key}
                      className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-800"
                    >
                      {FIELD_LABELS[key]}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section
            aria-labelledby="analysis-details-title"
            className="rounded-2xl border border-line bg-surface p-5 shadow-card"
          >
            <h3
              id="analysis-details-title"
              className="font-display text-lg tracking-tight"
            >
              Analysis details
            </h3>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Model</dt>
                <dd className="text-right font-medium text-ink">
                  {analysis.meta.model}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Prompt</dt>
                <dd className="text-right font-medium text-ink">
                  {analysis.meta.prompt_version}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Language</dt>
                <dd className="text-right font-medium text-ink">
                  {analysis.input_language}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Generated</dt>
                <dd className="text-right font-medium text-ink">
                  {formatTimestamp(analysis.meta.generated_at)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-line pt-3 text-[10px] leading-relaxed text-ink-soft">
              Request <span className="font-mono">{analysis.request_id}</span>
            </p>
          </section>

          <section className="rounded-2xl border border-accent/20 bg-accent-soft/45 p-5">
            <h3 className="text-sm font-semibold text-accent-deep">
              What this review is not
            </h3>
            <ul className="mt-2 space-y-2 text-xs leading-relaxed text-ink-soft">
              <li>Not an official verification of your complaint.</li>
              <li>Not a route to any government department.</li>
              <li>Not a submitted report.</li>
              <li>Not a safety assessment or emergency response.</li>
            </ul>
          </section>
        </aside>
      </div>
    </section>
  )
}
