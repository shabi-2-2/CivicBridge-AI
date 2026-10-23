import { useMemo, useState } from 'react'

import type { FieldDrafts } from '../lib/review'
import { FIELD_LABELS } from '../lib/analysisMeta'
import {
  AnalysisApiError,
  type AnalysisResponse,
  type FieldKey,
} from '../services/analysisApi'
import {
  buildReportRequest,
  generateReport,
  type ReportResponse,
} from '../services/reportApi'

type ReportPreviewProps = {
  analysis: AnalysisResponse
  drafts: FieldDrafts
}

type ReportState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; report: ReportResponse; signature: string }

function draftsSignature(drafts: FieldDrafts): string {
  return JSON.stringify(
    (Object.keys(drafts) as FieldKey[]).map((key) => [
      key,
      drafts[key].value.trim(),
      drafts[key].edited,
      drafts[key].confirmedByUser,
    ]),
  )
}

export function ReportPreview({ analysis, drafts }: ReportPreviewProps) {
  const [state, setState] = useState<ReportState>({ status: 'idle' })
  const [copyFeedback, setCopyFeedback] = useState<
    { tone: 'success' | 'error'; message: string } | null
  >(null)
  const [downloadFeedback, setDownloadFeedback] = useState<
    { tone: 'success' | 'error'; message: string } | null
  >(null)

  const signature = useMemo(() => draftsSignature(drafts), [drafts])
  const isLoading = state.status === 'loading'
  const isStale =
    state.status === 'success' && state.signature !== signature
  const report = state.status === 'success' ? state.report : null

  async function handleGenerate() {
    if (isLoading) return
    setState({ status: 'loading' })
    setCopyFeedback(null)
    setDownloadFeedback(null)

    const requestSignature = signature
    try {
      const generated = await generateReport(buildReportRequest(analysis, drafts))
      setState({
        status: 'success',
        report: generated,
        signature: requestSignature,
      })
    } catch (error) {
      const message =
        error instanceof AnalysisApiError
          ? error.message
          : 'The report could not be generated. Your edits are still here.'
      setState({ status: 'error', message })
    }
  }

  async function handleCopy() {
    if (!report) return
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable')
      }
      await navigator.clipboard.writeText(report.report_text)
      setCopyFeedback({ tone: 'success', message: 'Report copied to clipboard.' })
    } catch {
      setCopyFeedback({
        tone: 'error',
        message:
          'Copy failed. Open the preview and select the text to copy it manually.',
      })
    }
  }

  function handleDownload() {
    if (!report) return
    try {
      if (typeof URL.createObjectURL !== 'function') {
        throw new Error('Blob download unavailable')
      }
      const blob = new Blob([report.report_md], {
        type: 'text/markdown;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      try {
        const link = document.createElement('a')
        link.href = url
        link.download = report.filename
        document.body.appendChild(link)
        link.click()
        link.remove()
      } finally {
        URL.revokeObjectURL?.(url)
      }
      setDownloadFeedback({
        tone: 'success',
        message: `Report downloaded as ${report.filename}.`,
      })
    } catch {
      setDownloadFeedback({
        tone: 'error',
        message: 'Download failed. Your browser blocked the file save.',
      })
    }
  }

  const unresolved = report?.readiness.unresolved_keys ?? []
  const conflicts = analysis.review_flags.filter(
    (flag) => flag.code === 'CONFLICTING_INFORMATION',
  )

  return (
    <section
      aria-labelledby="report-preview-title"
      className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3
              id="report-preview-title"
              className="font-display text-xl tracking-tight"
            >
              Report preview
            </h3>
            <span className="rounded-full border border-line bg-paper-deep px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
              Generated on request
            </span>
          </div>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-ink-soft">
            Built from your latest edits and answers. Nothing is verified,
            routed, or submitted.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading
            ? 'Generating report…'
            : report
              ? 'Regenerate report'
              : 'Generate report'}
        </button>
      </div>

      {state.status === 'error' ? (
        <p role="alert" className="mt-3 text-xs leading-relaxed text-red-800">
          {state.message}
        </p>
      ) : null}

      {isStale ? (
        <p
          role="status"
          className="mt-3 rounded-lg border border-amber/20 bg-amber-soft px-3 py-2 text-xs leading-relaxed text-amber"
        >
          Your details changed since this report was generated. Regenerate it to
          match your latest edits.
        </p>
      ) : null}

      {report ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full border border-line bg-paper-deep px-2.5 py-0.5 font-semibold text-ink-soft">
              {report.readiness.label}: {report.readiness.score}%
            </span>
            {report.blocking_remaining ? (
              <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 font-semibold text-red-800">
                Blocking information remains
              </span>
            ) : (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-800">
                No blocking gaps
              </span>
            )}
            <span className="text-ink-soft">Completeness only, not verification.</span>
          </div>

          {unresolved.length > 0 || conflicts.length > 0 ? (
            <div className="rounded-lg border border-amber/20 bg-amber-soft/50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-amber">
                This report has unresolved details
              </p>
              <ul className="mt-1 space-y-0.5 text-[11px] leading-relaxed text-ink-soft">
                {unresolved.length > 0 ? (
                  <li>
                    Missing:{' '}
                    {unresolved.map((key) => FIELD_LABELS[key]).join(', ')}
                  </li>
                ) : null}
                {conflicts.length > 0 ? (
                  <li>
                    Conflicts:{' '}
                    {conflicts
                      .map((flag) =>
                        flag.field_key
                          ? FIELD_LABELS[flag.field_key]
                          : flag.code,
                      )
                      .join(', ')}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          <details className="group rounded-xl border border-line bg-paper/40">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-semibold text-accent-deep focus:outline-none">
              <span>Preview report</span>
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
            <pre
              tabIndex={0}
              aria-label="Generated report text"
              className="max-h-[26rem] overflow-auto whitespace-pre-wrap border-t border-line/60 px-3.5 py-3 font-sans text-xs leading-relaxed text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            >
              {report.report_md}
            </pre>
          </details>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              disabled={isStale}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-accent/40 hover:bg-accent-soft/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Copy report
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={isStale}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-accent/40 hover:bg-accent-soft/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Download report
            </button>
            <span className="text-[11px] text-ink-soft">{report.filename}</span>
          </div>

          {copyFeedback ? (
            <p
              role={copyFeedback.tone === 'error' ? 'alert' : 'status'}
              className={`text-[11px] ${
                copyFeedback.tone === 'error' ? 'text-red-800' : 'text-emerald-800'
              }`}
            >
              {copyFeedback.message}
            </p>
          ) : null}
          {downloadFeedback ? (
            <p
              role={downloadFeedback.tone === 'error' ? 'alert' : 'status'}
              className={`text-[11px] ${
                downloadFeedback.tone === 'error'
                  ? 'text-red-800'
                  : 'text-emerald-800'
              }`}
            >
              {downloadFeedback.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
