import { useRef, type FormEvent, type SVGProps } from 'react'

import { EXAMPLE_ISSUES, type ExampleId } from '../lib/examples'

export const MIN_COMPLAINT_LENGTH = 20
export const MAX_COMPLAINT_LENGTH = 2000
export const MAX_LOCATION_LENGTH = 200

type IssueFormProps = {
  text: string
  location: string
  onTextChange: (value: string) => void
  onLocationChange: (value: string) => void
  onSubmit: () => void
  isLoading: boolean
  validationMessage: string | null
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
  text,
  location,
  onTextChange,
  onLocationChange,
  onSubmit,
  isLoading,
  validationMessage,
}: IssueFormProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const trimmedLength = text.trim().length
  const charactersNeeded = Math.max(0, MIN_COMPLAINT_LENGTH - trimmedLength)
  const canAnalyze =
    trimmedLength >= MIN_COMPLAINT_LENGTH &&
    text.length <= MAX_COMPLAINT_LENGTH &&
    location.length <= MAX_LOCATION_LENGTH &&
    !isLoading

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (canAnalyze) {
      onSubmit()
    }
  }

  function applyExample(exampleText: string) {
    onTextChange(exampleText)
    textareaRef.current?.focus()
  }

  return (
    <section
      aria-labelledby="report-form-title"
      className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-7"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="report-form-title" className="font-display text-2xl tracking-tight">
            Describe a civic issue
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            A rough description is enough to start.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-amber/25 bg-amber-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber">
          Draft only
        </span>
      </div>

      <form className="mt-6 space-y-6" onSubmit={handleSubmit} aria-busy={isLoading}>
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="issue" className="text-sm font-semibold text-ink">
              What&apos;s happening?
            </label>
            <span
              className={`text-xs tabular-nums ${
                trimmedLength > 0 && trimmedLength < MIN_COMPLAINT_LENGTH
                  ? 'font-medium text-amber'
                  : 'text-ink-soft'
              }`}
            >
              {text.length} / {MAX_COMPLAINT_LENGTH}
            </span>
          </div>
          <textarea
            ref={textareaRef}
            id="issue"
            name="issue"
            rows={6}
            minLength={MIN_COMPLAINT_LENGTH}
            maxLength={MAX_COMPLAINT_LENGTH}
            required
            value={text}
            disabled={isLoading}
            onChange={(event) => onTextChange(event.target.value)}
            aria-describedby="issue-help"
            placeholder="For example: the drain outside our building has been overflowing since Monday, and the water is reaching the front steps."
            className="mt-2 w-full resize-y rounded-xl border border-line bg-paper/60 px-4 py-3 text-[15px] leading-relaxed text-ink placeholder:text-ink-soft/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-70"
          />
          <div
            id="issue-help"
            className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <p className="text-ink-soft">
              {trimmedLength === 0
                ? `At least ${MIN_COMPLAINT_LENGTH} characters are required.`
                : charactersNeeded > 0
                  ? `${charactersNeeded} more character${
                      charactersNeeded === 1 ? '' : 's'
                    } needed.`
                  : 'Enough detail to analyze.'}
            </p>
            <p className="text-ink-soft">
              Do not include personal contact details.
            </p>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-ink">Try an example</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLE_ISSUES.map((example) => (
              <button
                key={example.id}
                type="button"
                disabled={isLoading}
                onClick={() => applyExample(example.text)}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-accent/40 hover:bg-accent-soft/50 hover:text-accent-deep disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ExampleGlyph id={example.id} />
                {example.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="location" className="text-sm font-semibold text-ink">
              Location{' '}
              <span className="font-normal text-ink-soft">(optional)</span>
            </label>
            <span className="text-xs tabular-nums text-ink-soft">
              {location.length} / {MAX_LOCATION_LENGTH}
            </span>
          </div>
          <input
            id="location"
            name="location"
            type="text"
            maxLength={MAX_LOCATION_LENGTH}
            value={location}
            disabled={isLoading}
            onChange={(event) => onLocationChange(event.target.value)}
            placeholder="Street, landmark, or neighbourhood"
            className="mt-2 w-full rounded-xl border border-line bg-paper/60 px-4 py-3 text-[15px] text-ink placeholder:text-ink-soft/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-70"
          />
          <p className="mt-2 text-xs text-ink-soft">
            A landmark is enough for a first draft.
          </p>
        </div>

        {validationMessage ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {validationMessage}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!canAnalyze}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:bg-ink-soft/25 disabled:text-ink-soft"
        >
          {isLoading ? (
            <>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="h-4 w-4 motion-safe:animate-spin"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" opacity="0.25" />
                <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
              </svg>
              Analyzing your report…
            </>
          ) : (
            <>
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
            </>
          )}
        </button>

        <p className="text-center text-xs leading-relaxed text-ink-soft">
          Your description is sent to the Gemini API for analysis. CivicBridge AI
          does not file, route, or submit anything for you.
        </p>
      </form>
    </section>
  )
}
