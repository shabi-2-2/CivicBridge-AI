import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ReportPreview } from '../components/ReportPreview'
import { createFieldDrafts, type FieldDrafts } from '../lib/review'
import { API_BASE_URL } from '../services/analysisApi'
import type { ReportResponse } from '../services/reportApi'
import { SAMPLE_ANALYSIS } from './fixtures'

const DISCLAIMER =
  'AI-assisted draft. Not officially verified, routed, or submitted. Review every field before sharing it.'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response
}

function reportFixture(overrides: Partial<ReportResponse> = {}): ReportResponse {
  return {
    request_id: SAMPLE_ANALYSIS.request_id,
    report_md: `# CivicBridge AI report draft\n\n**Issue:** Deep pothole on Market Road\n\n---\n${DISCLAIMER}\n---`,
    report_text: `CivicBridge AI report draft\n\nIssue: Deep pothole on Market Road\n\n---\n${DISCLAIMER}\n---`,
    filename: 'civicbridge-report-testrequ-pothole.md',
    readiness: {
      ...SAMPLE_ANALYSIS.readiness,
      unresolved_keys: [],
    },
    blocking_remaining: false,
    ...overrides,
  }
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
}

function stubObjectUrl(createObjectURL: unknown, revokeObjectURL: unknown) {
  Object.defineProperty(URL, 'createObjectURL', {
    value: createObjectURL,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: revokeObjectURL,
    configurable: true,
    writable: true,
  })
}

function setup(overrides: Partial<FieldDrafts> = {}) {
  const drafts: FieldDrafts = {
    ...createFieldDrafts(SAMPLE_ANALYSIS),
    ...overrides,
  }
  return render(<ReportPreview analysis={SAMPLE_ANALYSIS} drafts={drafts} />)
}

async function generate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /generate report/i }))
  await screen.findByRole('button', { name: /regenerate report/i })
}

describe('ReportPreview', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    Object.defineProperty(URL, 'createObjectURL', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: undefined,
      configurable: true,
      writable: true,
    })
  })

  it('keeps the generated preview collapsed until it is opened', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(jsonResponse(reportFixture()))
    setup()

    expect(
      screen.queryByText(/civicbridge ai report draft/i),
    ).not.toBeInTheDocument()

    await generate(user)

    const preview = screen.getByText(/preview report/i).closest('details')
    expect(preview).not.toBeNull()
    expect(preview).not.toHaveAttribute('open')

    await user.click(screen.getByText(/preview report/i))
    expect(preview).toHaveAttribute('open')
  })

  it('copies the generated plain-text report and confirms success', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    fetchMock.mockResolvedValueOnce(jsonResponse(reportFixture()))
    setup()

    await generate(user)
    await user.click(screen.getByRole('button', { name: /copy report/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText).toHaveBeenCalledWith(reportFixture().report_text)
    expect(
      await screen.findByText('Report copied to clipboard.'),
    ).toBeInTheDocument()
  })

  it('reports a copy failure instead of claiming success', async () => {
    const user = userEvent.setup()
    stubClipboard(vi.fn().mockRejectedValue(new Error('nope')))
    fetchMock.mockResolvedValueOnce(jsonResponse(reportFixture()))
    setup()

    await generate(user)
    await user.click(screen.getByRole('button', { name: /copy report/i }))

    expect(
      await screen.findByText(/copy failed\. open the preview/i),
    ).toBeInTheDocument()
  })

  it('downloads the markdown report through a blob with the safe filename', async () => {
    const user = userEvent.setup()
    const createObjectURL = vi.fn().mockReturnValue('blob:report')
    const revokeObjectURL = vi.fn()
    stubObjectUrl(createObjectURL, revokeObjectURL)
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    fetchMock.mockResolvedValueOnce(jsonResponse(reportFixture()))
    setup()

    await generate(user)
    await user.click(screen.getByRole('button', { name: /download report/i }))

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1))
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.type).toContain('text/markdown')

    expect(clickSpy).toHaveBeenCalledTimes(1)
    const anchor = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement
    expect(anchor.download).toBe(reportFixture().filename)

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:report')
    expect(
      await screen.findByText(`Report downloaded as ${reportFixture().filename}.`),
    ).toBeInTheDocument()
  })

  it('reports a download failure instead of claiming success', async () => {
    const user = userEvent.setup()
    stubObjectUrl(undefined, undefined)
    fetchMock.mockResolvedValueOnce(jsonResponse(reportFixture()))
    setup()

    await generate(user)
    await user.click(screen.getByRole('button', { name: /download report/i }))

    expect(
      await screen.findByText(/download failed\. your browser blocked/i),
    ).toBeInTheDocument()
  })

  it('sends the latest edits and missing-field answers with the request', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(jsonResponse(reportFixture()))
    setup({
      'issue.description': {
        value: 'A deep pothole with exposed sharp edges outside the market',
        edited: true,
        confirmedByUser: true,
      },
      'issue.first_observed': {
        value: 'Three days ago',
        edited: true,
        confirmedByUser: true,
      },
    })

    await generate(user)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${API_BASE_URL}/api/v1/report`)

    const body = JSON.parse(String(init.body))
    expect(body.analysis.request_id).toBe(SAMPLE_ANALYSIS.request_id)
    expect(body.drafts['issue.description']).toEqual({
      value: 'A deep pothole with exposed sharp edges outside the market',
      edited: true,
      confirmedByUser: true,
    })
    // Only fields the analysis marked missing are sent as explicit answers.
    expect(body.user_answers['issue.first_observed']).toBe('Three days ago')
    expect(body.user_answers['issue.description']).toBeUndefined()
  })

  it('flags remaining gaps and unresolved details in the preview', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        reportFixture({
          blocking_remaining: true,
          readiness: {
            ...SAMPLE_ANALYSIS.readiness,
            score: 74,
            blocking_gaps: ['location.street_or_landmark'],
            unresolved_keys: ['location.postal_code', 'issue.access_notes'],
          },
        }),
      ),
    )
    setup()

    await generate(user)

    expect(screen.getByText('Blocking information remains')).toBeInTheDocument()
    expect(screen.getByText(/74%/)).toBeInTheDocument()
    expect(
      screen.getByText(/this report has unresolved details/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Missing: Postal code, Access notes/),
    ).toBeInTheDocument()
  })

  it('marks a generated report stale after the details change', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(jsonResponse(reportFixture()))
    const drafts = createFieldDrafts(SAMPLE_ANALYSIS)
    const view = render(
      <ReportPreview analysis={SAMPLE_ANALYSIS} drafts={drafts} />,
    )

    await generate(user)
    expect(screen.getByRole('button', { name: /copy report/i })).toBeEnabled()

    view.rerender(
      <ReportPreview
        analysis={SAMPLE_ANALYSIS}
        drafts={{
          ...drafts,
          'issue.description': {
            value: 'Changed wording after generating',
            edited: true,
            confirmedByUser: true,
          },
        }}
      />,
    )

    expect(
      screen.getByText(/your details changed since this report was generated/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy report/i })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /download report/i }),
    ).toBeDisabled()
  })
})
