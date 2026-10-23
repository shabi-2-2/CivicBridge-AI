import type { FormEvent, SVGProps } from 'react'

import { EXAMPLE_ISSUES, type ExampleId } from '../lib/examples'

type IssueFormProps = {
  issue: string
  location: string
  onIssueChange: (value: string) => void
  onLocationChange: (value: string) => void
  onAnalyze: () => void
}

function ExampleGlyph({ id }: { id: ExampleId }) {
  const common: SVGProps<SVGSVGElement> = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: 'h-3.5 w-3.5',
    'aria-hidden': true,
  }

  if (id === 'pothole') {
    return (
      <svg {...common}>
        <ellipse cx="12" cy="14" rx="8" ry="4" />
        <path d="M8 10l2 2m4-3-1 3m4-1-2 2" />
      </svg>
    )
  }

  if (id === 'garbage') {
    return (
      <svg {...common}>
        <path d="M4 7h16M9 7V5h6v2M6 7l1 12h10l1-12M10 11v4M14 11v4" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M12 21V9M12 9a4 4 0 0 1 4-4h2M18 5v4M8 21h8" />
    </svg>
  )
}

export function IssueForm({
  issue,
  location,
  onIssueChange,
  onLocationChange,
  onAnalyze,
}: IssueFormProps) {
  const canAnalyze = issue.trim().length > 0

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (canAnalyze) {
      onAnalyze()
    }
  }

  return (
    <section
      aria-labelledby="report-form-title"
      className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-7"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="report-form-title" className="font-display text-2xl tracking-tight">
            New civic report
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            A rough description is enough to start.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-amber/25 bg-amber-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber">
          Draft
        </span>
      </div>

      <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="issue" className="text-sm font-semibold text-ink">
              What&apos;s happening?
            </label>
            <span className="text-xs tabular-nums text-ink-soft">
              {issue.length} / 2000
            </span>
          </div>
          <textarea
            id="issue"
            name="issue"
            rows={5}
            maxLength={2000}
            required
            value={issue}
            onChange={(event) => onIssueChange(event.target.value)}
            placeholder="For example: the drain outside our building has been overflowing since Monday, and the water is reaching the front steps."
            className="mt-2 w-full resize-y rounded-xl border border-line bg-paper/60 px-4 py-3 text-[15px] leading-relaxed text-ink placeholder:text-ink-soft/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
          />
        </div>

        <div>
          <p className="text-sm font-semibold text-ink">Try an example</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLE_ISSUES.map((example) => (
              <button
                key={example.id}
                type="button"
                onClick={() => onIssueChange(example.text)}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:border-accent/40 hover:bg-accent-soft/50 hover:text-accent-deep"
              >
                <ExampleGlyph id={example.id} />
                {example.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="location" className="text-sm font-semibold text-ink">
            Location{' '}
            <span className="font-normal text-ink-soft">(optional)</span>
          </label>
          <input
            id="location"
            name="location"
            type="text"
            maxLength={200}
            value={location}
            onChange={(event) => onLocationChange(event.target.value)}
            placeholder="Street, landmark, or neighbourhood"
            className="mt-2 w-full rounded-xl border border-line bg-paper/60 px-4 py-3 text-[15px] text-ink placeholder:text-ink-soft/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
          />
          <p className="mt-2 text-xs text-ink-soft">
            A landmark is enough for a first draft.
          </p>
        </div>

        <button
          type="submit"
          disabled={!canAnalyze}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-accent-deep disabled:cursor-not-allowed disabled:bg-ink-soft/25 disabled:text-ink-soft"
        >
          Analyze issue
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>

        <p className="text-center text-xs leading-relaxed text-ink-soft">
          Phase 1 preview: analysis is not connected yet. Nothing is sent to any
          agency.
        </p>
      </form>
    </section>
  )
}
