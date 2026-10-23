import {
  FIELD_KEYS,
  type AnalysisResponse,
  type FieldKey,
} from '../services/analysisApi'
import {
  CATEGORY_LABELS,
  CHANNEL_LABELS,
  FIELD_LABELS,
  formatTimestamp,
} from './analysisMeta'

export type FieldDraft = {
  value: string
  edited: boolean
  confirmedByUser: boolean
}

export type FieldDrafts = Record<FieldKey, FieldDraft>

export function createFieldDrafts(analysis: AnalysisResponse): FieldDrafts {
  return Object.fromEntries(
    FIELD_KEYS.map((key) => [
      key,
      {
        value: analysis.fields[key].value ?? '',
        edited: false,
        confirmedByUser: false,
      },
    ]),
  ) as FieldDrafts
}

export function buildReviewDraft(
  analysis: AnalysisResponse,
  drafts: FieldDrafts,
): string {
  const lines: string[] = [
    'CIVICBRIDGE AI - FRONTEND REVIEW DRAFT',
    '',
    `Title: ${analysis.issue.title}`,
    `Category: ${CATEGORY_LABELS[analysis.issue.category]}`,
    `AI-suggested severity: ${analysis.issue.severity_suggestion}`,
    `Readiness: ${analysis.readiness.score}% (completeness only)`,
    '',
    'SUMMARY',
    analysis.issue.summary,
    '',
    'REVIEWED DETAILS',
  ]

  for (const key of FIELD_KEYS) {
    const draft = drafts[key]
    const value = draft.value.trim()
    if (!value) continue

    const provenance = draft.edited
      ? `edited by you; originally ${analysis.fields[key].status}`
      : draft.confirmedByUser
        ? `reviewed by you; originally ${analysis.fields[key].status}`
        : analysis.fields[key].status
    lines.push(`- ${FIELD_LABELS[key]}: ${value} [${provenance}]`)
  }

  if (analysis.missing_information.length > 0) {
    lines.push('', 'STILL MISSING')
    for (const item of analysis.missing_information) {
      lines.push(`- ${item.label}: ${item.question}`)
    }
  }

  if (analysis.review_flags.length > 0) {
    lines.push('', 'REVIEW FLAGS')
    for (const flag of analysis.review_flags) {
      lines.push(`- ${flag.message}`)
    }
  }

  if (analysis.emergency.triggered && analysis.emergency.message) {
    lines.push('', 'SAFETY WARNING', analysis.emergency.message)
  }

  if (analysis.suggested_next_steps.length > 0) {
    lines.push('', 'SUGGESTED NEXT STEPS')
    analysis.suggested_next_steps.forEach((step, index) => {
      lines.push(
        `${index + 1}. ${step.action} [${CHANNEL_LABELS[step.channel]}]`,
      )
    })
  }

  lines.push(
    '',
    `Prepared from analysis generated ${formatTimestamp(analysis.meta.generated_at)}.`,
    analysis.meta.disclaimer,
    'This draft was assembled in the browser from the fields above. Nothing has been sent to any agency.',
  )

  return lines.join('\n')
}
