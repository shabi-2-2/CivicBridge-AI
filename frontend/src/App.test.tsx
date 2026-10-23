import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { EXAMPLE_ISSUES } from './lib/examples'
import { API_BASE_URL } from './services/analysisApi'
import {
  CONFLICT_ANALYSIS,
  EMERGENCY_ANALYSIS,
  SAMPLE_ANALYSIS,
} from './test/fixtures'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response
}

function errorResponse(
  code: string,
  message: string,
  status: number,
  requestId = 'req-test-123',
): Response {
  return jsonResponse(
    {
      error: {
        code,
        message,
        request_id: requestId,
        retryable: true,
      },
    },
    status,
  )
}

async function usePotholeExample(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^pothole$/i }))
}

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /analyze issue/i }))
}

describe('CivicBridge analysis flow', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('populates the form from the pothole example', async () => {
    const user = userEvent.setup()
    render(<App />)

    await usePotholeExample(user)

    expect(
      screen.getByRole('textbox', { name: /what's happening/i }),
    ).toHaveValue(EXAMPLE_ISSUES[0].text)
  })

  it('rejects empty and too-short complaints on the client', async () => {
    const user = userEvent.setup()
    render(<App />)

    const textarea = screen.getByRole('textbox', {
      name: /what's happening/i,
    })
    const analyzeButton = screen.getByRole('button', {
      name: /analyze issue/i,
    })

    expect(analyzeButton).toBeDisabled()
    expect(
      screen.getByText('At least 20 characters are required.'),
    ).toBeInTheDocument()

    await user.type(textarea, 'Too short')
    expect(screen.getByText('11 more characters needed.')).toBeInTheDocument()
    expect(analyzeButton).toBeDisabled()

    await user.clear(textarea)
    await user.type(textarea, 'There is a pothole outside the market')
    expect(analyzeButton).toBeEnabled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the actual request and renders the structured response', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(jsonResponse(SAMPLE_ANALYSIS))
    render(<App />)

    await usePotholeExample(user)
    await user.type(
      screen.getByRole('textbox', { name: /location/i }),
      'Market Road',
    )
    await submit(user)

    expect(
      await screen.findByRole('heading', {
        name: 'Deep pothole on Market Road',
      }),
    ).toBeInTheDocument()

    expect(screen.getByText('AI-assisted draft')).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(
      screen.getByText(
        'The pothole is deep and affects moving traffic near a busy market.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(/deep pothole outside the community market/i).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getByText(
        'The pothole may expand when water enters the damaged surface.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('When did you first notice it?')).toBeInTheDocument()
    expect(screen.getAllByText(/low-confidence inference/i).length).toBeGreaterThan(0)
    expect(screen.getByText('78%')).toBeInTheDocument()
    expect(
      screen.getAllByText(/municipal roads or public works reporting channel/i).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText(SAMPLE_ANALYSIS.meta.disclaimer).length,
    ).toBeGreaterThan(0)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${API_BASE_URL}/api/v1/analyze`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      text: EXAMPLE_ISSUES[0].text,
      location_hint: 'Market Road',
    })
  })

  it('disables the analyze button while a request is in flight', async () => {
    const user = userEvent.setup()
    let resolveResponse!: (value: Response) => void
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve
      }),
    )
    render(<App />)

    await usePotholeExample(user)
    await submit(user)

    const loadingButton = screen.getByRole('button', {
      name: /analyzing your report/i,
    })
    expect(loadingButton).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveResponse(jsonResponse(SAMPLE_ANALYSIS))
    })

    expect(
      await screen.findByRole('heading', {
        name: 'Deep pothole on Market Road',
      }),
    ).toBeInTheDocument()
  })

  it('preserves the complaint and shows a safe error when the backend times out', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(
      errorResponse(
        'GEMINI_TIMEOUT',
        'Gemini did not respond in time. Please try again.',
        504,
      ),
    )
    render(<App />)

    await usePotholeExample(user)
    await submit(user)

    expect(
      await screen.findByRole('heading', { name: 'Gemini timed out' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: /what's happening/i }),
    ).toHaveValue(EXAMPLE_ISSUES[0].text)
    expect(
      screen.getByText('Gemini did not respond in time. Please try again.'),
    ).toBeInTheDocument()
    expect(screen.getByText('req-test-123')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()

    fetchMock.mockResolvedValueOnce(jsonResponse(SAMPLE_ANALYSIS))
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(
      await screen.findByRole('heading', {
        name: 'Deep pothole on Market Road',
      }),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('shows a friendly message when the backend is unreachable', async () => {
    const user = userEvent.setup()
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    render(<App />)

    await usePotholeExample(user)
    await submit(user)

    expect(
      await screen.findByRole('heading', {
        name: 'The backend is not reachable',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Could not reach the CivicBridge backend/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/fetch failed/i)).not.toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: /what's happening/i }),
    ).toHaveValue(EXAMPLE_ISSUES[0].text)
  })

  it('updates the field review state and frontend draft after an edit', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(jsonResponse(SAMPLE_ANALYSIS))
    render(<App />)

    await usePotholeExample(user)
    await submit(user)

    const description = await screen.findByRole('textbox', {
      name: 'Issue description',
    })
    await user.clear(description)
    await user.type(description, 'A deep pothole with exposed sharp edges')

    expect(screen.getByText('Edited by you')).toBeInTheDocument()
    expect(screen.getByText(/AI original:/)).toBeInTheDocument()
    expect(
      screen.getByLabelText('Frontend-only review draft text'),
    ).toHaveTextContent('A deep pothole with exposed sharp edges')
  })

  it('displays the emergency warning when the backend triggers one', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(jsonResponse(EMERGENCY_ANALYSIS))
    render(<App />)

    await usePotholeExample(user)
    await submit(user)

    const alert = await screen.findByRole('alert')
    expect(
      within(alert).getByRole('heading', { name: /possible immediate hazard/i }),
    ).toBeInTheDocument()
    expect(
      within(alert).getAllByText(EMERGENCY_ANALYSIS.emergency.message as string).length,
    ).toBeGreaterThan(0)
    expect(
      within(alert).getByText(/has not contacted emergency services/i),
    ).toBeInTheDocument()
  })

  it('renders conflicting values and review flags', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(jsonResponse(CONFLICT_ANALYSIS))
    render(<App />)

    await usePotholeExample(user)
    await submit(user)

    expect(await screen.findByText('Conflicting')).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'City or district' }),
    ).toHaveValue('Springfield / Riverton')
    expect(screen.getByText(/Capped at 80/)).toBeInTheDocument()
    expect(
      screen.getAllByText(/preserved it instead of choosing a value/i).length,
    ).toBeGreaterThan(0)
  })

  it('allows answering the priority missing question inline in One Detail to Add', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(jsonResponse(SAMPLE_ANALYSIS))
    render(<App />)

    await usePotholeExample(user)
    await submit(user)

    expect(
      await screen.findByRole('heading', { name: 'One detail to add' }),
    ).toBeInTheDocument()
    expect(screen.getByText('When did you first notice it?')).toBeInTheDocument()

    const inlineInput = screen.getByRole('textbox', {
      name: 'Answer for First observed',
    })
    await user.type(inlineInput, 'Three days ago after rain')

    expect(screen.getByText('Added to draft')).toBeInTheDocument()
    expect(
      screen.getByLabelText('Frontend-only review draft text'),
    ).toHaveTextContent('Three days ago after rain')
  })
})

