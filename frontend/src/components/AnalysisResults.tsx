import { useEffect, useRef } from 'react'

import {
  CATEGORY_LABELS,
  CHANNEL_LABELS,
  FIELD_LABELS,
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
import { OneThingToAdd } from './OneThingToAdd'
import { ReviewDraft } from './ReviewDraft'

type AnalysisResultsProps = {
  analysis: AnalysisResponse
  drafts: FieldDrafts
  onFieldChange: (key: FieldKey, value: string) => void
  onToggleFieldReviewed: (key: FieldKey) => void
  onResetField: (key: FieldKey) => void
}

function getCompletenessStatus(analysis: AnalysisResponse): {
  label: string
  badgeClass: string
} {
  if (analysis.readiness.blocking_gaps.length > 0) {
    const hasLocationGap = analysis.readiness.blocking_gaps.some((k) =>
      k.startsWith('location.'),
    )
    if (hasLocationGap) {
      return {
        label: 'Needs location',
        badgeClass: 'border-red-200 bg-red-50 text-red-800',
      }
    }
    return {
      label: 'Needs details',
      badgeClass: 'border-amber/20 bg-amber-soft text-amber',
    }
  }
  if (analysis.readiness.conflict_cap_applied) {
    return {
      label: 'Needs conflict check',
      badgeClass: 'border-red-200 bg-red-50 text-red-800',
    }
  }
  return {
    label: 'Ready to review',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }
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
  const status = getCompletenessStatus(analysis)

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    headingRef.current?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'start',
    })
  }, [])

  const visibleSteps = analysis.suggested_next_steps.slice(0, 3)
  const remainingSteps = analysis.suggested_next_steps.slice(3)

  return (
    <section id="results" aria-labelledby="analysis-title" className="scroll-mt-8 space-y-6">
      {/* 1. Emergency Warning (always outside collapsible) */}
      {analysis.emergency.triggered ? (
        <div
          role="alert"
          className="rounded-2xl border-2 border-red-300 bg-red-50 p-5 sm:p-6"
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

      {/* 2. Compact Results Summary */}
      <header className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-accent/20 bg-accent-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-deep">
              {CATEGORY_LABELS[analysis.issue.category]}
            </span>
            <span className="rounded-full border border-amber/20 bg-amber-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber">
              AI-assisted draft
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${status.badgeClass}`}
            >
              {status.label}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-ink-soft">
              {analysis.readiness.label}:
            </span>
            <span className="font-display text-2xl tracking-tight text-accent-deep sm:text-3xl">
              {analysis.readiness.score}%
            </span>
          </div>
        </div>

        <h2
          ref={headingRef}
          id="analysis-title"
          tabIndex={-1}
          className="mt-4 font-display text-3xl leading-tight tracking-tight focus:outline-none sm:text-4xl"
        >
          {analysis.issue.title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft sm:text-base">
          {analysis.issue.summary}
        </p>

        {/* Small report completeness progress */}
        <div className="mt-4">
          <div
            role="progressbar"
            aria-labelledby="readiness-summary-label"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={analysis.readiness.score}
            className="h-2 overflow-hidden rounded-full bg-paper-deep"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${analysis.readiness.score}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-soft">
            <span id="readiness-summary-label">{analysis.readiness.note}</span>
            <span>
              {analysis.readiness.filled_weight} of{' '}
              {analysis.readiness.total_weight} weighted points
            </span>
          </div>
          {analysis.readiness.conflict_cap_applied ? (
            <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] leading-relaxed text-red-900">
              Capped at 80 while conflicting information remains.
            </p>
          ) : null}
          {analysis.readiness.blocking_gaps.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-ink-soft">
                Blocking gaps:
              </span>
              {analysis.readiness.blocking_gaps.map((key) => (
                <span
                  key={key}
                  className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-800"
                >
                  {FIELD_LABELS[key]}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Severity pill */}
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
        </div>

        <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-soft">
          {analysis.meta.disclaimer}
        </p>
      </header>

      {/* 3. "One thing to add" (Primary missing question with inline input) */}
      <OneThingToAdd
        missing={analysis.missing_information}
        readiness={analysis.readiness}
        drafts={drafts}
        onFieldChange={onFieldChange}
      />

      {/* 4. Progressive Disclosure: Collapsible "Review details" section */}
      <details
        aria-labelledby="fields-title"
        className="group rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
      >
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 focus:outline-none">
          <div>
            <div className="flex items-center gap-2">
              <h3 id="fields-title" className="font-display text-xl tracking-tight">
                Review details
              </h3>
              <span className="rounded-full border border-line bg-paper-deep px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                {FIELD_KEYS.length} fields
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              Click any field to expand, review evidence quotes, or edit values.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-accent-deep group-open:hidden">
              Show all fields
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

        <div className="mt-4 space-y-2.5 border-t border-line/60 pt-4">
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

        {/* AI Inferences (shown cleanly inside Review Details if present) */}
        {analysis.inferences.length > 0 ? (
          <div className="mt-6 border-t border-line/60 pt-5">
            <h4 className="font-display text-lg tracking-tight">AI inferences</h4>
            <p className="mt-1 text-xs text-ink-soft">
              Interpretations that were not stated word-for-word in your complaint.
            </p>
            <ul className="mt-3 space-y-2.5">
              {analysis.inferences.map((inference, index) => (
                <li
                  key={`${inference.statement}-${index}`}
                  className="rounded-xl border border-amber/20 bg-amber-soft/40 p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full border border-amber/20 bg-surface/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber">
                      Inference
                    </span>
                    <span className="text-[11px] text-ink-soft">
                      {formatConfidence(inference.confidence)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-ink">
                    {inference.statement}
                  </p>
                  <p className="mt-1.5 text-xs text-ink-soft">
                    <span className="font-semibold text-ink">Basis:</span>{' '}
                    {inference.basis}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    <span className="font-semibold text-ink">Risk if wrong:</span>{' '}
                    {inference.risk_if_wrong}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Review Flags (shown cleanly inside Review Details if present) */}
        {analysis.review_flags.length > 0 ? (
          <div className="mt-6 border-t border-line/60 pt-5">
            <h4 className="font-display text-lg tracking-tight">Review flags</h4>
            <p className="mt-1 text-xs text-ink-soft">
              Automated checks for conflicts, unverified quotes, and low confidence.
            </p>
            <ul className="mt-3 space-y-2.5">
              {analysis.review_flags.map((flag, index) => {
                const flagSeverity = REVIEW_SEVERITY_META[flag.severity]
                return (
                  <li
                    key={`${flag.code}-${flag.field_key ?? 'general'}-${index}`}
                    className={`rounded-xl border p-3.5 ${flagSeverity.panelClass}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-current/20 bg-surface/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]">
                        {flagSeverity.label}
                      </span>
                      {flag.field_key ? (
                        <span className="text-[11px] font-semibold opacity-90">
                          {FIELD_LABELS[flag.field_key]}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed">{flag.message}</p>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
      </details>

      {/* 5. Concise Next Steps (max 3 shown, rest collapsed) */}
      {analysis.suggested_next_steps.length > 0 ? (
        <section
          aria-labelledby="steps-title"
          className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
        >
          <h3 id="steps-title" className="font-display text-xl tracking-tight">
            Suggested next steps
          </h3>
          <p className="mt-1 text-xs text-ink-soft">
            Guidance for reporting this issue. CivicBridge AI does not contact
            agencies on your behalf.
          </p>

          <ol className="mt-4 space-y-3">
            {visibleSteps.map((step) => (
              <li key={step.order} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-deep">
                  {step.order}
                </span>
                <div>
                  <p className="text-sm leading-relaxed text-ink">{step.action}</p>
                  <p className="mt-0.5 text-[11px] text-ink-soft">
                    {CHANNEL_LABELS[step.channel]}
                    {step.is_generic_guidance ? ' · Generic guidance' : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {remainingSteps.length > 0 ? (
            <details className="group mt-4 border-t border-line/60 pt-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-accent-deep hover:text-accent focus:outline-none">
                <span>Show {remainingSteps.length} more steps</span>
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
              <ol start={4} className="mt-3 space-y-3">
                {remainingSteps.map((step) => (
                  <li key={step.order} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-deep">
                      {step.order}
                    </span>
                    <div>
                      <p className="text-sm leading-relaxed text-ink">
                        {step.action}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-soft">
                        {CHANNEL_LABELS[step.channel]}
                        {step.is_generic_guidance ? ' · Generic guidance' : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </section>
      ) : null}

      {/* 6. Report Draft Preview (collapsed by default) */}
      <ReviewDraft analysis={analysis} drafts={drafts} />

      {/* 7. Technical Details (collapsed by default) */}
      <details className="group rounded-2xl border border-line bg-surface p-4 shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft hover:text-ink focus:outline-none">
          <span>Technical & model details</span>
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
        <dl className="mt-3 grid gap-2 border-t border-line/60 pt-3 text-xs sm:grid-cols-2">
          <div className="flex justify-between gap-2">
            <dt className="text-ink-soft">Model</dt>
            <dd className="font-medium text-ink">{analysis.meta.model}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-soft">Prompt version</dt>
            <dd className="font-medium text-ink">
              {analysis.meta.prompt_version}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-soft">Language</dt>
            <dd className="font-medium text-ink">{analysis.input_language}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-soft">Generated</dt>
            <dd className="font-medium text-ink">
              {formatTimestamp(analysis.meta.generated_at)}
            </dd>
          </div>
          <div className="flex justify-between gap-2 sm:col-span-2">
            <dt className="text-ink-soft">Request ID</dt>
            <dd className="font-mono text-[11px] text-ink">
              {analysis.request_id}
            </dd>
          </div>
        </dl>
      </details>
    </section>
  )
}
