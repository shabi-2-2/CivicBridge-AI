import type {
  AnalysisResponse,
  ExtractedField,
  FieldKey,
} from '../services/analysisApi'

const fields: Record<FieldKey, ExtractedField> = {
  'issue.description': {
    key: 'issue.description',
    value: 'A deep pothole outside the community market',
    status: 'provided',
    confidence: 0.96,
    evidence_quote: 'deep pothole outside the community market',
    rationale: null,
  },
  'issue.first_observed': {
    key: 'issue.first_observed',
    value: null,
    status: 'missing',
    confidence: null,
    evidence_quote: null,
    rationale: null,
  },
  'issue.frequency': {
    key: 'issue.frequency',
    value: 'Ongoing',
    status: 'inferred',
    confidence: 0.55,
    evidence_quote: null,
    rationale: 'The complaint describes the pothole as still present.',
  },
  'issue.scale': {
    key: 'issue.scale',
    value: 'About a metre wide',
    status: 'provided',
    confidence: 0.9,
    evidence_quote: 'about a metre wide',
    rationale: null,
  },
  'issue.impact': {
    key: 'issue.impact',
    value: 'Cars swerve into the opposite lane',
    status: 'provided',
    confidence: 0.93,
    evidence_quote: 'Cars swerve into the opposite lane',
    rationale: null,
  },
  'issue.hazard': {
    key: 'issue.hazard',
    value: 'Potential collision risk',
    status: 'inferred',
    confidence: 0.35,
    evidence_quote: null,
    rationale: 'Swerving traffic suggests a possible safety risk.',
  },
  'location.street_or_landmark': {
    key: 'location.street_or_landmark',
    value: 'Market Road',
    status: 'provided',
    confidence: 0.94,
    evidence_quote: 'Market Road',
    rationale: null,
  },
  'location.city_or_district': {
    key: 'location.city_or_district',
    value: 'Springfield',
    status: 'provided',
    confidence: 0.9,
    evidence_quote: 'Springfield',
    rationale: null,
  },
  'location.postal_code': {
    key: 'location.postal_code',
    value: null,
    status: 'missing',
    confidence: null,
    evidence_quote: null,
    rationale: null,
  },
  'issue.access_notes': {
    key: 'issue.access_notes',
    value: null,
    status: 'missing',
    confidence: null,
    evidence_quote: null,
    rationale: null,
  },
}

export const SAMPLE_ANALYSIS: AnalysisResponse = {
  schema_version: '1.0',
  request_id: 'test-request-id',
  input_language: 'en',
  issue: {
    category: 'pothole',
    title: 'Deep pothole on Market Road',
    summary:
      'A deep pothole outside the community market is causing cars to swerve into the opposite lane.',
    severity_suggestion: 'high',
    severity_rationale:
      'The pothole is deep and affects moving traffic near a busy market.',
    is_emergency_suspected: false,
    emergency_reason: null,
  },
  fields,
  inferences: [
    {
      statement: 'The pothole may expand when water enters the damaged surface.',
      basis: 'Potholes commonly worsen with water and repeated traffic.',
      confidence: 0.58,
      risk_if_wrong: 'Repair urgency may be overstated.',
    },
  ],
  photo_observations: [],
  missing_information: [
    {
      key: 'issue.first_observed',
      label: 'First observed',
      question: 'When did you first notice it?',
      priority: 'recommended',
      reason: 'Timing helps establish urgency and whether the issue is new.',
    },
    {
      key: 'location.postal_code',
      label: 'Postal code',
      question: 'What is the postal code? (optional)',
      priority: 'optional',
      reason: 'A postal code can speed up location matching.',
    },
    {
      key: 'issue.access_notes',
      label: 'Access notes',
      question: 'Any access details a crew should know? (optional)',
      priority: 'optional',
      reason: 'Access notes help a crew find and reach the site.',
    },
  ],
  review_flags: [
    {
      code: 'LOW_CONFIDENCE_INFERENCE',
      field_key: 'issue.hazard',
      severity: 'info',
      message:
        "'issue.hazard' is a low-confidence inference. Check it before including it in a report.",
    },
  ],
  readiness: {
    score: 78,
    label: 'Report completeness',
    filled_weight: 18,
    total_weight: 23,
    blocking_gaps: [],
    conflict_cap_applied: false,
    note: 'Completeness only; this is not a trust, accuracy, or verification score.',
  },
  suggested_next_steps: [
    {
      order: 1,
      action:
        "Review every field labelled 'inferred' or 'conflicting' and correct anything that is wrong.",
      channel: 'other',
      is_generic_guidance: true,
    },
    {
      order: 2,
      action:
        'Use your municipal roads or public works reporting channel and include the exact location.',
      channel: 'municipal_website',
      is_generic_guidance: true,
    },
    {
      order: 3,
      action:
        'Send the finished report through the official channel yourself and keep any reference number you receive.',
      channel: 'other',
      is_generic_guidance: true,
    },
  ],
  emergency: {
    triggered: false,
    model_flagged: false,
    matched_rules: [],
    message: null,
    contacts_emergency_services: false,
  },
  meta: {
    model: 'gemini-test-model',
    prompt_version: 'test-prompt-v1',
    generated_at: '2026-10-23T10:00:00+00:00',
    needs_human_review: true,
    disclaimer:
      'AI-assisted draft. Not officially verified, routed, or submitted. Review every field before sharing it.',
  },
}

export const EMERGENCY_ANALYSIS: AnalysisResponse = {
  ...SAMPLE_ANALYSIS,
  issue: {
    ...SAMPLE_ANALYSIS.issue,
    is_emergency_suspected: true,
    emergency_reason: 'A strong smell of gas was reported near the school.',
  },
  emergency: {
    triggered: true,
    model_flagged: false,
    matched_rules: ['possible gas leak'],
    message:
      'This description mentions a possible immediate hazard. If anyone is in danger, contact your local emergency services now. CivicBridge AI has not contacted anyone and cannot determine whether the situation is safe.',
    contacts_emergency_services: false,
  },
}

export const CONFLICT_ANALYSIS: AnalysisResponse = {
  ...SAMPLE_ANALYSIS,
  fields: {
    ...SAMPLE_ANALYSIS.fields,
    'location.city_or_district': {
      ...SAMPLE_ANALYSIS.fields['location.city_or_district'],
      value: 'Springfield / Riverton',
      status: 'conflicting',
      confidence: 0.4,
      evidence_quote: null,
      rationale: 'The complaint names two different cities.',
    },
  },
  review_flags: [
    {
      code: 'CONFLICTING_INFORMATION',
      field_key: 'location.city_or_district',
      severity: 'warning',
      message:
        "The input contains conflicting information for 'location.city_or_district'. CivicBridge AI preserved it instead of choosing a value. Review and confirm which detail is correct.",
    },
  ],
  readiness: {
    ...SAMPLE_ANALYSIS.readiness,
    score: 80,
    conflict_cap_applied: true,
    blocking_gaps: ['location.city_or_district'],
  },
}
