import { useEffect, useRef } from 'react'

export function AnalysisLoading() {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    headingRef.current?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'start',
    })
  }, [])

  return (
    <section
      id="results"
      aria-labelledby="analysis-loading-title"
      aria-live="polite"
      aria-busy="true"
      className="scroll-mt-8"
    >
      <div className="rounded-2xl border border-accent/20 bg-surface p-6 shadow-card sm:p-8">
        <div className="flex items-start gap-4">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-deep">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-5 w-5 motion-safe:animate-spin"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" opacity="0.25" />
              <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <h2
              ref={headingRef}
              id="analysis-loading-title"
              tabIndex={-1}
              className="font-display text-2xl tracking-tight focus:outline-none"
            >
              Structuring your complaint…
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
              Extracting facts, quotes, and safety checks. Keep this page open.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="rounded-xl border border-line bg-paper/60 p-4"
            >
              <div className="h-3 w-28 rounded bg-paper-deep" />
              <div className="mt-3 h-3 w-full rounded bg-paper-deep/80" />
              <div className="mt-2 h-3 w-4/5 rounded bg-paper-deep/70" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
