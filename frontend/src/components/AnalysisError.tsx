import { useEffect, useRef } from 'react'

import type { AnalysisApiError } from '../services/analysisApi'

const ERROR_TITLES: Record<string, string> = {
  BACKEND_UNAVAILABLE: 'The backend is not reachable',
  REQUEST_TIMEOUT: 'The request took too long',
  INVALID_INPUT: 'Check the complaint details',
  GEMINI_TIMEOUT: 'Gemini timed out',
  GEMINI_RATE_LIMITED: 'Gemini is rate limited',
  GEMINI_NOT_CONFIGURED: 'Gemini is not configured',
  GEMINI_AUTH_FAILED: 'Gemini rejected the API credentials',
  GEMINI_MODEL_UNAVAILABLE: 'The Gemini model is unavailable',
  GEMINI_INVALID_OUTPUT: 'The AI response was not usable',
  GEMINI_UNAVAILABLE: 'Gemini is unavailable',
  INVALID_RESPONSE: 'The backend response was unexpected',
  SERVER_ERROR: 'The backend returned an error',
}

type AnalysisErrorProps = {
  error: AnalysisApiError
  onRetry: () => void
}

export function AnalysisError({ error, onRetry }: AnalysisErrorProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const title = ERROR_TITLES[error.code] ?? 'The analysis could not be completed'

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    headingRef.current?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'start',
    })
  }, [])

  return (
    <section id="results" aria-labelledby="analysis-error-title" className="scroll-mt-8">
      <div
        role="alert"
        className="rounded-2xl border border-red-200 bg-red-50/70 p-6 sm:p-8"
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex rounded-full border border-red-200 bg-surface/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-red-800">
              Analysis failed
            </span>
            <h2
              ref={headingRef}
              id="analysis-error-title"
              tabIndex={-1}
              className="mt-4 font-display text-2xl tracking-tight text-red-950 focus:outline-none sm:text-3xl"
            >
              {title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-red-900 sm:text-base">
              {error.message}
            </p>

            {error.details.length > 0 ? (
              <ul className="mt-4 space-y-2 rounded-xl border border-red-200 bg-surface/70 p-4 text-sm text-red-900">
                {error.details.map((detail) => (
                  <li key={`${detail.field}-${detail.message}`}>
                    <span className="font-semibold">{detail.field}:</span>{' '}
                    {detail.message}
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="mt-4 text-sm font-medium text-red-950">
              Your complaint is still in the form. Nothing was submitted.
            </p>
            {error.requestId ? (
              <p className="mt-3 text-xs text-red-800/80">
                Reference:{' '}
                <span className="font-mono">{error.requestId}</span>
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onRetry}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-deep"
          >
            Try again
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
              <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
            </svg>
          </button>
        </div>

        {!error.retryable ? (
          <p className="mt-5 border-t border-red-200/70 pt-4 text-xs leading-relaxed text-red-900/80">
            This error may need a backend configuration change before retrying.
          </p>
        ) : null}
      </div>
    </section>
  )
}
