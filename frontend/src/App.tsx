import { useRef, useState } from 'react'

import { AnalysisEmptyState } from './components/AnalysisEmptyState'
import { AnalysisError } from './components/AnalysisError'
import { AnalysisLoading } from './components/AnalysisLoading'
import { AnalysisResults } from './components/AnalysisResults'
import {
  IssueForm,
  MAX_LOCATION_LENGTH,
  MIN_COMPLAINT_LENGTH,
} from './components/IssueForm'
import { SiteFooter } from './components/SiteFooter'
import { SiteHeader } from './components/SiteHeader'
import { createFieldDrafts, type FieldDrafts } from './lib/review'
import {
  AnalysisApiError,
  analyzeComplaint,
  type AnalysisResponse,
  type FieldKey,
} from './services/analysisApi'

const STEPS = [
  {
    number: '01',
    title: 'Describe it',
    body: 'Write the problem the way you would tell a neighbour.',
  },
  {
    number: '02',
    title: 'Check the evidence',
    body: 'Compare facts, AI inferences, conflicts and missing details, then edit.',
  },
  {
    number: '03',
    title: 'Choose the channel',
    body: 'Review a clean draft, then send it yourself through an official channel.',
  },
]

type AnalysisState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: AnalysisApiError }
  | { status: 'success'; analysis: AnalysisResponse; drafts: FieldDrafts }

function validateComplaint(text: string, location: string): string | null {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return 'Describe the civic issue before analyzing.'
  }
  if (trimmed.length < MIN_COMPLAINT_LENGTH) {
    const needed = MIN_COMPLAINT_LENGTH - trimmed.length
    return `Add ${needed} more character${needed === 1 ? '' : 's'} before analyzing.`
  }
  if (text.length > 2000) {
    return 'The complaint must be 2000 characters or fewer.'
  }
  if (location.trim().length > MAX_LOCATION_LENGTH) {
    return `The location hint must be ${MAX_LOCATION_LENGTH} characters or fewer.`
  }
  return null
}

export default function App() {
  const [issue, setIssue] = useState('')
  const [location, setLocation] = useState('')
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    status: 'idle',
  })
  const inFlightRef = useRef(false)

  const isLoading = analysisState.status === 'loading'

  function handleIssueChange(value: string) {
    setIssue(value)
    if (validationMessage) setValidationMessage(null)
  }

  function handleLocationChange(value: string) {
    setLocation(value)
    if (validationMessage) setValidationMessage(null)
  }

  async function handleAnalyze() {
    if (inFlightRef.current) return

    const message = validateComplaint(issue, location)
    if (message) {
      setValidationMessage(message)
      return
    }

    setValidationMessage(null)
    inFlightRef.current = true
    setAnalysisState({ status: 'loading' })

    try {
      const analysis = await analyzeComplaint({
        text: issue.trim(),
        location_hint: location.trim() || null,
      })
      setAnalysisState({
        status: 'success',
        analysis,
        drafts: createFieldDrafts(analysis),
      })
    } catch (error) {
      const apiError =
        error instanceof AnalysisApiError
          ? error
          : new AnalysisApiError({
              code: 'UNKNOWN',
              retryable: true,
              message:
                'The analysis could not be completed. No draft was created. Please try again.',
            })
      setAnalysisState({ status: 'error', error: apiError })
    } finally {
      inFlightRef.current = false
    }
  }

  function updateFieldDraft(
    key: FieldKey,
    update: (draft: FieldDrafts[FieldKey], originalValue: string) => FieldDrafts[FieldKey],
  ) {
    setAnalysisState((previous) => {
      if (previous.status !== 'success') return previous
      const originalValue = previous.analysis.fields[key].value ?? ''
      return {
        ...previous,
        drafts: {
          ...previous.drafts,
          [key]: update(previous.drafts[key], originalValue),
        },
      }
    })
  }

  function handleFieldChange(key: FieldKey, value: string) {
    updateFieldDraft(key, (draft, originalValue) => ({
      ...draft,
      value,
      edited: value !== originalValue,
      confirmedByUser: true,
    }))
  }

  function handleToggleFieldReviewed(key: FieldKey) {
    updateFieldDraft(key, (draft) => ({
      ...draft,
      confirmedByUser: !draft.confirmedByUser,
    }))
  }

  function handleResetField(key: FieldKey) {
    updateFieldDraft(key, (_draft, originalValue) => ({
      value: originalValue,
      edited: false,
      confirmedByUser: false,
    }))
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div
        className="page-wash pointer-events-none absolute inset-x-0 top-0 h-[42rem]"
        aria-hidden="true"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 sm:px-8">
        <SiteHeader />

        <main className="flex-1 pb-20">
          <section className="grid items-start gap-12 pb-14 pt-12 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16 lg:pt-20">
            <div className="lg:pt-2">
              <p className="mb-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                <span className="h-px w-8 bg-accent/50" aria-hidden="true" />
                Civic reporting, clarified
              </p>

              <h1 className="font-display text-[2.75rem] leading-[1.04] tracking-[-0.02em] text-ink sm:text-5xl lg:text-[3.8rem]">
                From a messy complaint to a review you can trust yourself with.
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-soft sm:text-lg">
                Describe a pothole, a pile of garbage, a dark streetlight, or a
                leak in your own words. CivicBridge AI structures the details,
                separates what you reported from what it inferred, and shows you
                what is still missing — before you send anything.
              </p>

              <ol className="mt-10 grid gap-5 border-t border-line pt-8 sm:grid-cols-3 sm:gap-6">
                {STEPS.map((step) => (
                  <li key={step.number}>
                    <p className="font-display text-sm text-accent">
                      {step.number}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {step.title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                      {step.body}
                    </p>
                  </li>
                ))}
              </ol>

              <div className="mt-10 flex max-w-xl gap-3 rounded-xl border border-line bg-surface/70 p-4">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-0.5 h-5 w-5 shrink-0 text-accent"
                  aria-hidden="true"
                >
                  <path d="M12 3l7 3v5c0 4.5-2.9 8.2-7 10-4.1-1.8-7-5.5-7-10V6l7-3z" />
                  <path d="M9.5 12l1.8 1.8L15 10" />
                </svg>
                <p className="text-sm leading-relaxed text-ink-soft">
                  <span className="font-semibold text-ink">
                    Nothing is filed for you.
                  </span>{' '}
                  CivicBridge AI drafts reports; it does not verify, route, or
                  submit them. You stay the reporter.
                </p>
              </div>
            </div>

            <IssueForm
              text={issue}
              location={location}
              onTextChange={handleIssueChange}
              onLocationChange={handleLocationChange}
              onSubmit={handleAnalyze}
              isLoading={isLoading}
              validationMessage={validationMessage}
            />
          </section>

          {analysisState.status === 'loading' ? <AnalysisLoading /> : null}
          {analysisState.status === 'error' ? (
            <AnalysisError
              error={analysisState.error}
              onRetry={handleAnalyze}
            />
          ) : null}
          {analysisState.status === 'success' ? (
            <AnalysisResults
              analysis={analysisState.analysis}
              drafts={analysisState.drafts}
              onFieldChange={handleFieldChange}
              onToggleFieldReviewed={handleToggleFieldReviewed}
              onResetField={handleResetField}
            />
          ) : null}
          {analysisState.status === 'idle' ? <AnalysisEmptyState /> : null}
        </main>

        <SiteFooter />
      </div>
    </div>
  )
}
