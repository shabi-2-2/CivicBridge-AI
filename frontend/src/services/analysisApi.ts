export const FIELD_KEYS = [
  'issue.description',
  'issue.first_observed',
  'issue.frequency',
  'issue.scale',
  'issue.impact',
  'issue.hazard',
  'location.street_or_landmark',
  'location.city_or_district',
  'location.postal_code',
  'issue.access_notes',
] as const

export type FieldKey = (typeof FIELD_KEYS)[number]
export type IssueCategory =
  | 'pothole'
  | 'road_damage'
  | 'garbage'
  | 'streetlight'
  | 'water_leak'
  | 'drainage'
  | 'sidewalk'
  | 'other'
export type SeveritySuggestion = 'low' | 'medium' | 'high' | 'critical'
export type FieldStatus = 'provided' | 'inferred' | 'missing' | 'conflicting'
export type MissingPriority = 'blocking' | 'recommended' | 'optional'
export type ReviewSeverity = 'info' | 'warning' | 'critical'
export type NextStepChannel =
  | 'emergency_services'
  | 'municipal_website'
  | 'municipal_phone'
  | 'utility'
  | 'in_person'
  | 'other'

export type AnalyzeRequest = {
  text: string
  location_hint: string | null
}

export type ExtractedField = {
  key: FieldKey
  value: string | null
  status: FieldStatus
  confidence: number | null
  evidence_quote: string | null
  rationale: string | null
}

export type Inference = {
  statement: string
  basis: string
  confidence: number
  risk_if_wrong: string
}

export type PhotoObservation = {
  observation: string
  confidence: number
}

export type IssueExtraction = {
  category: IssueCategory
  title: string
  summary: string
  severity_suggestion: SeveritySuggestion
  severity_rationale: string
  is_emergency_suspected: boolean
  emergency_reason: string | null
}

export type MissingInformation = {
  key: FieldKey
  label: string
  question: string
  priority: MissingPriority
  reason: string
}

export type ReviewFlag = {
  code: string
  field_key: FieldKey | null
  severity: ReviewSeverity
  message: string
}

export type Readiness = {
  score: number
  label: string
  filled_weight: number
  total_weight: number
  blocking_gaps: FieldKey[]
  conflict_cap_applied: boolean
  note: string
}

export type NextStep = {
  order: number
  action: string
  channel: NextStepChannel
  is_generic_guidance: boolean
}

export type EmergencyNotice = {
  triggered: boolean
  model_flagged: boolean
  matched_rules: string[]
  message: string | null
  contacts_emergency_services: boolean
}

export type AnalysisMeta = {
  model: string
  prompt_version: string
  generated_at: string
  needs_human_review: boolean
  disclaimer: string
}

export type AnalysisResponse = {
  schema_version: string
  request_id: string
  input_language: string
  issue: IssueExtraction
  fields: Record<FieldKey, ExtractedField>
  inferences: Inference[]
  photo_observations: PhotoObservation[]
  missing_information: MissingInformation[]
  review_flags: ReviewFlag[]
  readiness: Readiness
  suggested_next_steps: NextStep[]
  emergency: EmergencyNotice
  meta: AnalysisMeta
}

export type ValidationIssue = {
  field: string
  message: string
}

type ErrorEnvelope = {
  error: {
    code: string
    message: string
    request_id: string
    retryable: boolean
    details?: ValidationIssue[] | null
  }
}

const DEFAULT_API_BASE_URL = 'http://localhost:8000'
const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

export const API_BASE_URL = (configuredBaseUrl || DEFAULT_API_BASE_URL).replace(
  /\/+$/,
  '',
)

export const ANALYZE_TIMEOUT_MS = 45_000

export class AnalysisApiError extends Error {
  readonly code: string
  readonly status: number | null
  readonly retryable: boolean
  readonly requestId: string | null
  readonly details: ValidationIssue[]

  constructor(options: {
    code: string
    message: string
    status?: number | null
    retryable?: boolean
    requestId?: string | null
    details?: ValidationIssue[]
  }) {
    super(options.message)
    this.name = 'AnalysisApiError'
    this.code = options.code
    this.status = options.status ?? null
    this.retryable = options.retryable ?? false
    this.requestId = options.requestId ?? null
    this.details = options.details ?? []
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (!isRecord(value) || !isRecord(value.error)) return false
  return (
    typeof value.error.code === 'string' &&
    typeof value.error.message === 'string' &&
    typeof value.error.request_id === 'string' &&
    typeof value.error.retryable === 'boolean' &&
    (value.error.details === undefined ||
      value.error.details === null ||
      (Array.isArray(value.error.details) &&
        value.error.details.every(
          (detail) =>
            isRecord(detail) &&
            typeof detail.field === 'string' &&
            typeof detail.message === 'string',
        )))
  )
}

function isAnalysisResponse(value: unknown): value is AnalysisResponse {
  if (!isRecord(value)) return false
  if (value.schema_version !== '1.0') return false
  const fields = value.fields
  return (
    typeof value.request_id === 'string' &&
    typeof value.input_language === 'string' &&
    isRecord(value.issue) &&
    isRecord(fields) &&
    FIELD_KEYS.every((key) => isRecord(fields[key])) &&
    Array.isArray(value.inferences) &&
    Array.isArray(value.photo_observations) &&
    Array.isArray(value.missing_information) &&
    Array.isArray(value.review_flags) &&
    isRecord(value.readiness) &&
    Array.isArray(value.suggested_next_steps) &&
    isRecord(value.emergency) &&
    isRecord(value.meta) &&
    typeof value.meta.disclaimer === 'string'
  )
}

function fallbackError(status: number): AnalysisApiError {
  if (status === 422) {
    return new AnalysisApiError({
      code: 'INVALID_INPUT',
      status,
      message:
        'The complaint did not pass validation. Check the length and try again.',
    })
  }
  if (status === 429) {
    return new AnalysisApiError({
      code: 'GEMINI_RATE_LIMITED',
      status,
      retryable: true,
      message: 'The analysis service is rate limited. Wait a moment and try again.',
    })
  }
  if (status === 502) {
    return new AnalysisApiError({
      code: 'GEMINI_INVALID_OUTPUT',
      status,
      retryable: true,
      message:
        'The analysis service returned an unusable response. No draft was created. Try again.',
    })
  }
  if (status === 503) {
    return new AnalysisApiError({
      code: 'GEMINI_UNAVAILABLE',
      status,
      retryable: true,
      message:
        'The analysis service is unavailable right now. No draft was created. Try again shortly.',
    })
  }
  if (status === 504) {
    return new AnalysisApiError({
      code: 'GEMINI_TIMEOUT',
      status,
      retryable: true,
      message: 'The analysis service timed out. No draft was created. Try again.',
    })
  }
  return new AnalysisApiError({
    code: 'SERVER_ERROR',
    status,
    retryable: status >= 500,
    message: 'The backend returned an error. No draft was created. Please try again.',
  })
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function analyzeComplaint(
  request: AnalyzeRequest,
): Promise<AnalysisResponse> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS)

  try {
    let response: Response
    try {
      response = await fetch(`${API_BASE_URL}/api/v1/analyze`, {
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
            'The analysis request took too long. The backend or Gemini may be slow. Please try again.',
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
      if (isErrorEnvelope(body)) {
        throw new AnalysisApiError({
          code: body.error.code,
          status: response.status,
          message: body.error.message,
          retryable: body.error.retryable,
          requestId:
            body.error.request_id ||
            response.headers.get('X-Request-ID') ||
            null,
          details: body.error.details ?? [],
        })
      }
      throw fallbackError(response.status)
    }

    if (!isAnalysisResponse(body)) {
      throw new AnalysisApiError({
        code: 'INVALID_RESPONSE',
        status: response.status,
        retryable: true,
        message:
          'The backend returned an unexpected response. No draft was created. Please try again.',
      })
    }

    return body
  } finally {
    window.clearTimeout(timeout)
  }
}
