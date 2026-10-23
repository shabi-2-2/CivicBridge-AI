import { useMemo, useState } from 'react'

import { buildReviewDraft, type FieldDrafts } from '../lib/review'
import type { AnalysisResponse } from '../services/analysisApi'

type ReviewDraftProps = {
  analysis: AnalysisResponse
  drafts: FieldDrafts
}

export function ReviewDraft({ analysis, drafts }: ReviewDraftProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const draft = useMemo(
    () => buildReviewDraft(analysis, drafts),
    [analysis, drafts],
  )

  async function handleCopy() {
    try {
      if (!navigator.clipboard) {
        throw new Error('Clipboard unavailable')
      }
      await navigator.clipboard.writeText(draft)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
  }

  return (
    <section
      aria-labelledby="review-draft-title"
      className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="review-draft-title" className="font-display text-xl tracking-tight">
              Review draft
            </h3>
            <span className="rounded-full border border-line bg-paper-deep px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
              Frontend-only
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-soft">
            Built in this browser from the original analysis and your edits. It is
            not an official report and has not been sent anywhere.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink transition-colors hover:border-accent/40 hover:bg-accent-soft/40"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
          </svg>
          {copyState === 'copied' ? 'Copied' : 'Copy draft'}
        </button>
      </div>

      {copyState === 'error' ? (
        <p role="alert" className="mt-3 text-xs text-red-800">
          Copying is unavailable in this browser. Select the draft text below to
          copy it manually.
        </p>
      ) : null}

      <pre
        tabIndex={0}
        aria-label="Frontend-only review draft text"
        className="mt-4 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-paper/60 p-4 font-sans text-xs leading-relaxed text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      >
        {draft}
      </pre>
    </section>
  )
}
