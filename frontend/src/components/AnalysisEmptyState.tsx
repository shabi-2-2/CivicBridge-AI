import { STATUS_META } from '../lib/analysisMeta'
import type { FieldStatus } from '../services/analysisApi'

const STATUS_ORDER: FieldStatus[] = [
  'provided',
  'inferred',
  'missing',
  'conflicting',
]

export function AnalysisEmptyState() {
  return (
    <section
      id="results"
      aria-labelledby="empty-results-title"
      className="scroll-mt-8"
    >
      <div className="rounded-2xl border border-dashed border-line bg-surface/55 p-6 sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="max-w-2xl">
            <span className="inline-flex rounded-full bg-paper-deep px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
              Awaiting a description
            </span>
            <h2
              id="empty-results-title"
              className="mt-4 font-display text-2xl tracking-tight sm:text-3xl"
            >
              Your evidence-labelled review will appear here
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft sm:text-base">
              After analysis, you will be able to check each detail against the
              words you wrote, correct mistakes, answer missing questions, and
              review a frontend-only draft before choosing where to send it.
            </p>
            <p className="mt-3 text-sm font-medium text-accent-deep">
              Nothing is sent to an agency from this page.
            </p>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
              Provenance labels
            </h3>
            <ul className="mt-3 space-y-3">
              {STATUS_ORDER.map((status) => (
                <li key={status} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${STATUS_META[status].badgeClass}`}
                  >
                    {STATUS_META[status].label}
                  </span>
                  <span className="text-xs leading-relaxed text-ink-soft">
                    {STATUS_META[status].description}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
