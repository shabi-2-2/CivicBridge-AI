import { useEffect, useRef } from 'react'

type ResultsPlaceholderProps = {
  active: boolean
}

const OUTPUT_PARTS = [
  { label: 'Facts you provided', dotClass: 'bg-accent' },
  { label: 'AI inferences', dotClass: 'bg-amber' },
  { label: 'Missing details', dotClass: 'bg-ink-soft' },
]

export function ResultsPlaceholder({ active }: ResultsPlaceholderProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!active) return
    headingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    headingRef.current?.focus({ preventScroll: true })
  }, [active])

  return (
    <section id="results" aria-live="polite" className="scroll-mt-8">
      <div
        className={`rounded-2xl border border-dashed p-6 transition-colors sm:p-10 ${
          active
            ? 'border-accent/40 bg-accent-soft/30'
            : 'border-line bg-surface/50'
        }`}
      >
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                active
                  ? 'bg-surface text-accent-deep'
                  : 'bg-paper-deep text-ink-soft'
              }`}
            >
              {active ? 'No analysis run' : 'Awaiting a description'}
            </span>

            <h2
              ref={headingRef}
              tabIndex={-1}
              className="mt-4 font-display text-2xl tracking-tight focus:outline-none sm:text-3xl"
            >
              {active
                ? 'Analysis isn’t connected yet'
                : 'Your structured report will appear here'}
            </h2>

            {active ? (
              <>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft sm:text-base">
                  Your description is saved on this page only. In Phase 2, Gemini
                  will turn it into a structured draft you can review — facts,
                  inferences, missing details, and next steps kept separate.
                </p>
                <p className="mt-3 text-sm font-medium text-accent-deep">
                  No AI was called, no report was generated, and nothing has been
                  sent to any agency.
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-ink-soft sm:text-base">
                Once analysis is connected, this is where you&apos;ll review what
                you said, what the AI inferred, what is still missing, and the
                draft report itself.
              </p>
            )}
          </div>

          <ul className="grid shrink-0 gap-2 text-xs text-ink-soft sm:w-52">
            {OUTPUT_PARTS.map((part) => (
              <li
                key={part.label}
                className="flex items-center gap-2.5 rounded-lg border border-line/80 bg-surface/80 px-3 py-2"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${part.dotClass}`}
                  aria-hidden="true"
                />
                {part.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
