import type {
  FieldKey,
  FieldStatus,
  IssueCategory,
  MissingPriority,
  NextStepChannel,
  ReviewSeverity,
  SeveritySuggestion,
} from '../services/analysisApi'

export const FIELD_LABELS: Record<FieldKey, string> = {
  'issue.description': 'Issue description',
  'issue.first_observed': 'First observed',
  'issue.frequency': 'Frequency',
  'issue.scale': 'Scale or extent',
  'issue.impact': 'Impact',
  'issue.hazard': 'Immediate hazard',
  'location.street_or_landmark': 'Street or landmark',
  'location.city_or_district': 'City or district',
  'location.postal_code': 'Postal code',
  'issue.access_notes': 'Access notes',
}

export const FIELD_HINTS: Record<FieldKey, string> = {
  'issue.description': 'Describe the issue in your own words',
  'issue.first_observed': 'e.g. Since Monday morning',
  'issue.frequency': 'e.g. Every time it rains',
  'issue.scale': 'e.g. About one metre wide',
  'issue.impact': 'e.g. Cars swerve into oncoming traffic',
  'issue.hazard': 'e.g. Live wire nearby, or no immediate danger',
  'location.street_or_landmark': 'e.g. Market Road, outside the market',
  'location.city_or_district': 'e.g. Springfield',
  'location.postal_code': 'e.g. 12345',
  'issue.access_notes': 'e.g. Accessible from the main road',
}

export const CATEGORY_LABELS: Record<IssueCategory, string> = {
  pothole: 'Pothole',
  road_damage: 'Road damage',
  garbage: 'Garbage',
  streetlight: 'Streetlight',
  water_leak: 'Water leak',
  drainage: 'Drainage',
  sidewalk: 'Sidewalk',
  other: 'Other',
}

export const SEVERITY_META: Record<
  SeveritySuggestion,
  { label: string; badgeClass: string; panelClass: string }
> = {
  low: {
    label: 'Low',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    panelClass: 'border-emerald-200 bg-emerald-50/70',
  },
  medium: {
    label: 'Medium',
    badgeClass: 'border-amber/25 bg-amber-soft text-amber',
    panelClass: 'border-amber/20 bg-amber-soft/60',
  },
  high: {
    label: 'High',
    badgeClass: 'border-orange-200 bg-orange-50 text-orange-800',
    panelClass: 'border-orange-200 bg-orange-50/70',
  },
  critical: {
    label: 'Critical',
    badgeClass: 'border-red-200 bg-red-50 text-red-800',
    panelClass: 'border-red-200 bg-red-50/70',
  },
}

export const STATUS_META: Record<
  FieldStatus,
  { label: string; badgeClass: string; description: string }
> = {
  provided: {
    label: 'Provided',
    badgeClass: 'border-accent/20 bg-accent-soft text-accent-deep',
    description: 'Stated in your complaint. The quoted words were found in your input.',
  },
  inferred: {
    label: 'Inferred',
    badgeClass: 'border-amber/20 bg-amber-soft text-amber',
    description: 'An AI interpretation. Review it before relying on it.',
  },
  missing: {
    label: 'Missing',
    badgeClass: 'border-line bg-paper-deep text-ink-soft',
    description: 'Not stated in your complaint.',
  },
  conflicting: {
    label: 'Conflicting',
    badgeClass: 'border-red-200 bg-red-50 text-red-800',
    description: 'Your input contains more than one version of this detail.',
  },
}

export const PRIORITY_META: Record<
  MissingPriority,
  { label: string; badgeClass: string }
> = {
  blocking: {
    label: 'Blocking',
    badgeClass: 'border-red-200 bg-red-50 text-red-800',
  },
  recommended: {
    label: 'Recommended',
    badgeClass: 'border-amber/20 bg-amber-soft text-amber',
  },
  optional: {
    label: 'Optional',
    badgeClass: 'border-line bg-paper-deep text-ink-soft',
  },
}

export const REVIEW_SEVERITY_META: Record<
  ReviewSeverity,
  { label: string; panelClass: string }
> = {
  info: {
    label: 'Note',
    panelClass: 'border-sky-200 bg-sky-50/70 text-sky-900',
  },
  warning: {
    label: 'Review',
    panelClass: 'border-amber/25 bg-amber-soft/60 text-ink',
  },
  critical: {
    label: 'Important',
    panelClass: 'border-red-200 bg-red-50/80 text-red-900',
  },
}

export const CHANNEL_LABELS: Record<NextStepChannel, string> = {
  emergency_services: 'Emergency services',
  municipal_website: 'Municipal website',
  municipal_phone: 'Municipal phone',
  utility: 'Utility',
  in_person: 'In person',
  other: 'General guidance',
}

export function formatConfidence(confidence: number | null): string {
  if (confidence === null) return 'No confidence score'
  return `${Math.round(confidence * 100)}% confidence`
}

export function formatTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
