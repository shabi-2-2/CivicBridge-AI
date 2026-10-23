import { useState } from 'react'

import { IssueForm } from './components/IssueForm'
import { ResultsPlaceholder } from './components/ResultsPlaceholder'
import { SiteFooter } from './components/SiteFooter'
import { SiteHeader } from './components/SiteHeader'

const STEPS = [
  {
    number: '01',
    title: 'Describe it',
    body: 'Write the problem the way you would tell a neighbour.',
  },
  {
    number: '02',
    title: 'Check the evidence',
    body: 'Separate what you said from what the AI inferred, and fill the gaps.',
  },
  {
    number: '03',
    title: 'Send it yourself',
    body: 'Export a clean draft, then choose the official channel.',
  },
]

export default function App() {
  const [issue, setIssue] = useState('')
  const [location, setLocation] = useState('')
  const [hasSubmitted, setHasSubmitted] = useState(false)

  function handleAnalyze() {
    setHasSubmitted(true)
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
                From a messy complaint to a report you can send.
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
              issue={issue}
              location={location}
              onIssueChange={(value) => setIssue(value)}
              onLocationChange={(value) => setLocation(value)}
              onAnalyze={handleAnalyze}
            />
          </section>

          <ResultsPlaceholder active={hasSubmitted} />
        </main>

        <SiteFooter />
      </div>
    </div>
  )
}
