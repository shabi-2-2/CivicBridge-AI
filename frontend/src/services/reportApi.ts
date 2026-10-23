import {
  AnalysisApiError,
  API_BASE_URL,
  type AnalysisResponse,
  type FieldKey,
  type Readiness,
} from './analysisApi'
import type { FieldDrafts } from '../lib/review'

export const REPORT_TIMEOUT_MS = 20_000

export type ReportReadiness = Readiness & {
  unresolved_keys: FieldKey[]
}

export type ReportResponse = {
  request_id: string
  report_md: string
  report_text: string
  filename: string
  readiness: ReportReadiness
  blocking_remaining: boolean
}

export type ReportDraftPayload = {
  value: string
  edited: boolean
  confirmedByUser: boolean
}

export type ReportRequest = {
  analysis: AnalysisResponse
  drafts: Record<string, ReportDraftPayload>
  user_answers: Record<string, string>
}

/**
 * Build the POST /api/v1/report body from the current review state.
 *
 * The full analysis is sent back unchanged (the server re-validates it), the
 * latest draft values are sent as overrides, and any non-empty answer for a
 * field the analysis marked missing is sent as an explicit user answer.
 */
export function buildReportRequest(
  analysis: AnalysisResponse,
  drafts: FieldDrafts,
): ReportRequest {
  const draftPayload: Record<string, ReportDraftPayload> = {}
  const userAnswers: Record<string, string> = {}

  for (const key of Object.keys(drafts) as FieldKey[]) {
    const draft = drafts[key]
    draftPayload[key] = {
      value: draft.value,
      edited: draft.edited,
      confirmedByUser: draft.confirmedByUser,
    }

    const value = draft.value.trim()
    if (value && analysis.fields[key].status === 'missing') {
      userAnswers[key] = value
    }
  }

  return {
    analysis,
    drafts: draftPayload,
    user_answers: userAnswers,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isReportResponse(value: unknown): value is ReportResponse {
  if (!isRecord(value)) return false
  return (
    typeof value.request_id === 'string' &&
    typeof value.report_md === 'string' &&
    typeof value.report_text === 'string' &&
    typeof value.filename === 'string' &&
    typeof value.blocking_remaining === 'boolean' &&
    isRecord(value.readiness) &&
    typeof value.readiness.score === 'number' &&
    Array.isArray(value.readiness.unresolved_keys) &&
    Array.isArray(value.readiness.blocking_gaps)
  )
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function generateReport(
  request: ReportRequest,
): Promise<ReportResponse> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REPORT_TIMEOUT_MS)

  try {
    let response: Response
    try {
      response = await fetch(`${API_BASE_URL}/api/v1/report`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      })
    } catch {
      if (controller.signal.aborted) {
        throw new AnalysisApiError({
          code: 'REQUEST_TIMEOUT',
          retryable: true,
          message:
            'Generating the report took too long. Your edits are still here. Please try again.',
        })
      }
      throw new AnalysisApiError({
        code: 'BACKEND_UNAVAILABLE',
        retryable: true,
        message: `Could not reach the CivicBridge backend at ${API_BASE_URL}. Make sure it is running, then try again.`,
      })
    }

    const body = await readJson(response)

    if (!response.ok) {
      if (
        isRecord(body) &&
        isRecord(body.error) &&
        typeof body.error.code === 'string' &&
        typeof body.error.message === 'string'
      ) {
        throw new AnalysisApiError({
          code: body.error.code,
          status: response.status,
          message: body.error.message,
          retryable: Boolean(body.error.retryable),
          requestId:
            typeof body.error.request_id === 'string'
              ? body.error.request_id
              : null,
        })
      }
      throw new AnalysisApiError({
        code: 'REPORT_FAILED',
        status: response.status,
        retryable: response.status >= 500,
        message: 'The report could not be generated. Your edits are still here.',
      })
    }

    if (!isReportResponse(body)) {
      throw new AnalysisApiError({
        code: 'INVALID_RESPONSE',
        status: response.status,
        retryable: true,
        message:
          'The backend returned an unexpected report response. Please try again.',
      })
    }

    return body
  } finally {
    window.clearTimeout(timeout)
  }
}
