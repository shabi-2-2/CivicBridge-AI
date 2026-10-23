"""Deterministic report generation from an analyzed civic complaint.

This module never calls Gemini. It recalculates derived fields using existing
backend services (derived, catalog) and formats a Markdown + plain-text report
with the exact disclaimer.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from pydantic import Field, model_validator

from app.schemas.analysis import (
    AnalysisResponse,
    DISCLAIMER,
    EmergencyNotice,
    ExtractedField,
    FieldKey,
    FieldStatus,
    IssueCategory,
    Readiness,
    StrictModel,
)
from app.services.catalog import FIELD_LABELS
from app.services.derived import compute_readiness

# ---------------------------------------------------------------------------
# Report data contract
# ---------------------------------------------------------------------------


class FieldDraftInput(StrictModel):
    """One field's latest client-side draft value and review flags."""

    value: str = Field(default="", max_length=600)
    edited: bool = False
    confirmedByUser: bool = False


class ReportRequest(StrictModel):
    """Input to the report endpoint: analyzed draft + user edits + answers.

    The frontend sends back the AnalysisResponse it received together with the
    current FieldDrafts and any explicit answers to missing-field questions.
    Everything is re-validated and recalculated server-side.
    """

    analysis: AnalysisResponse
    drafts: dict[str, FieldDraftInput] = {}
    user_answers: dict[str, str] = {}

    @model_validator(mode="after")
    def validate_keys(self) -> "ReportRequest":
        allowed = {key.value for key in FieldKey}
        unknown_drafts = sorted(set(self.drafts) - allowed)
        if unknown_drafts:
            raise ValueError(
                "drafts contains unknown field keys: " + ", ".join(unknown_drafts)
            )
        unknown_answers = sorted(set(self.user_answers) - allowed)
        if unknown_answers:
            raise ValueError(
                "user_answers contains unknown field keys: "
                + ", ".join(unknown_answers)
            )
        for key, answer in self.user_answers.items():
            if len(answer) > 600:
                raise ValueError(f"user_answers[{key}] must be 600 characters or fewer")
        return self


class ReportReadiness(Readiness):
    """Readiness for the report, plus the keys that remain unresolved.

    ``unresolved_keys`` is completeness bookkeeping only; it is not a trust,
    accuracy, or verification signal.
    """

    unresolved_keys: list[FieldKey] = []


class ReportResponse(StrictModel):
    """Validated response from the report endpoint."""

    request_id: str
    report_md: str
    report_text: str
    filename: str
    readiness: ReportReadiness
    blocking_remaining: bool
    # Deliberately no complaint ID and no submission status: none exist.

# ---------------------------------------------------------------------------
# Field resolution (analysis + latest user edits)
# ---------------------------------------------------------------------------

_PROVENANCE_BY_STATUS: dict[FieldStatus, str] = {
    FieldStatus.PROVIDED: "reported by you",
    FieldStatus.INFERRED: "inferred by AI",
    FieldStatus.CONFLICTING: "conflicting details in your input",
    FieldStatus.MISSING: "",
}


@dataclass(frozen=True)
class _ReportField:
    key: FieldKey
    value: str | None
    status: FieldStatus
    evidence_quote: str | None
    provenance: str


def _clean(value: Any) -> str:
    return str(value).strip() if isinstance(value, str) else ""


def _resolve_fields(
    analysis: AnalysisResponse,
    drafts: dict[str, Any],
    user_answers: dict[str, str],
) -> list[_ReportField]:
    """Merge the server-side analysis with the client's latest draft.

    A draft only overrides the analysis when it carries content or an explicit
    edit/confirmation. An untouched, empty draft never erases an analysed
    value. Evidence quotes are kept only while the wording they were checked
    against is unchanged.
    """

    resolved: list[_ReportField] = []

    for key in FieldKey:
        base = analysis.fields[key]
        base_value = _clean(base.value)

        raw_draft = drafts.get(key.value)
        draft = raw_draft if isinstance(raw_draft, dict) else {}
        draft_value = _clean(draft.get("value"))
        edited = bool(draft.get("edited"))
        confirmed = bool(draft.get("confirmedByUser"))
        answer = _clean(user_answers.get(key.value))

        value = ""
        status = FieldStatus.MISSING
        evidence: str | None = None
        provenance = ""

        if answer and base.status == FieldStatus.MISSING:
            # Explicit answers are only accepted for questions the analysis
            # marked missing; they never silently replace an analysed fact.
            value = answer
            status = FieldStatus.PROVIDED
            provenance = "answered by you"
        elif draft_value:
            value = draft_value
            if draft_value != base_value:
                status = FieldStatus.PROVIDED
                provenance = "edited by you"
                # The original quote no longer matches this wording.
                evidence = None
            else:
                status = base.status
                provenance = "reviewed by you" if confirmed else _PROVENANCE_BY_STATUS[base.status]
                evidence = base.evidence_quote
        elif edited and base_value:
            # The user deliberately cleared a value that the analysis found.
            value = ""
            status = FieldStatus.MISSING
        elif base_value:
            value = base_value
            status = base.status
            provenance = _PROVENANCE_BY_STATUS[base.status]
            evidence = base.evidence_quote
        elif confirmed:
            status = FieldStatus.MISSING
            provenance = "left blank by you"

        resolved.append(
            _ReportField(
                key=key,
                value=value or None,
                status=status,
                evidence_quote=evidence,
                provenance=provenance,
            )
        )

    return resolved


def _shadow_fields(fields: list[_ReportField]) -> dict[FieldKey, ExtractedField]:
    """Build ExtractedField instances so readiness uses the canonical logic."""

    shadow: dict[FieldKey, ExtractedField] = {}
    for field in fields:
        if not field.value:
            shadow[field.key] = ExtractedField(
                key=field.key,
                value=None,
                status=FieldStatus.MISSING,
                confidence=None,
                evidence_quote=None,
                rationale=None,
            )
            continue

        status = field.status
        if status == FieldStatus.MISSING:
            status = FieldStatus.PROVIDED
        if field.provenance in {
            "answered by you",
            "edited by you",
        }:
            status = FieldStatus.PROVIDED

        shadow[field.key] = ExtractedField(
            key=field.key,
            value=field.value,
            status=status,
            confidence=0.5,
            evidence_quote=field.evidence_quote or field.value,
            rationale=(
                "User-supplied detail from the review draft."
                if status in {FieldStatus.INFERRED, FieldStatus.CONFLICTING}
                else None
            ),
        )
    return shadow


def _compute_report_readiness(
    category: IssueCategory,
    fields: list[_ReportField],
) -> ReportReadiness:
    readiness = compute_readiness(category, _shadow_fields(fields))
    return ReportReadiness(
        **readiness.model_dump(),
        unresolved_keys=[
            field.key for field in fields if not field.value
        ],
    )


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


def _fact_line(field: _ReportField, markdown: bool) -> str:
    assert field.value is not None
    label = FIELD_LABELS[field.key]
    suffix = f" ({field.provenance})" if field.provenance else ""
    if field.evidence_quote:
        evidence = (
            f' *Evidence:* "{field.evidence_quote}"'
            if markdown
            else f' Evidence: "{field.evidence_quote}"'
        )
    else:
        evidence = ""
    if markdown:
        return f"- **{label}:** {field.value}{suffix}{evidence}"
    return f"- {label}: {field.value}{suffix}{evidence}"


def _severity_line(analysis: AnalysisResponse) -> str:
    suggestion = analysis.issue.severity_suggestion
    rationale = analysis.issue.severity_rationale
    return (
        f"{suggestion.value.title()} (tentative AI suggestion: {rationale})"
    )


def _emergency_block(emergency: EmergencyNotice) -> list[str]:
    lines = [
        emergency.message or "This report contains a safety warning.",
        "",
    ]
    if emergency.matched_rules:
        lines.append(
            "*Matched safety rules:* " + ", ".join(emergency.matched_rules)
        )
        lines.append("")
    lines.append(
        "CivicBridge AI has not contacted emergency services. This warning is "
        "based on the words in the complaint, not a safety assessment."
    )
    return lines


def _build_report_content(
    analysis: AnalysisResponse,
    drafts: dict[str, Any],
    user_answers: dict[str, str],
) -> tuple[str, str, ReportReadiness]:
    """Return (markdown_report, plain_text_report, readiness). No Gemini call."""

    fields = _resolve_fields(analysis, drafts, user_answers)
    readiness = _compute_report_readiness(analysis.issue.category, fields)

    facts = [field for field in fields if field.value]
    user_facts = [
        field
        for field in facts
        if field.status == FieldStatus.PROVIDED
        or field.provenance in {"edited by you", "answered by you", "reviewed by you"}
    ]
    inferred = [field for field in facts if field.status == FieldStatus.INFERRED]
    conflicts = [field for field in facts if field.status == FieldStatus.CONFLICTING]
    unresolved = [field for field in fields if not field.value]
    edited = [
        field
        for field in facts
        if field.provenance in {"edited by you", "answered by you"}
    ]

    # ------------------------------- Markdown -------------------------------
    md: list[str] = []
    md.append("# CivicBridge AI report draft")
    md.append("")
    md.append(f"**Issue:** {analysis.issue.title}")
    md.append("")
    md.append(analysis.issue.summary)
    md.append("")
    md.append(
        f"**Category:** {analysis.issue.category.value.replace('_', ' ').title()}  "
    )
    md.append(f"**Tentative severity:** {_severity_line(analysis)}")
    md.append("")

    md.append("## AI inferences (not user-provided facts)")
    md.append("")
    if analysis.inferences:
        for inference in analysis.inferences:
            md.append(f"- **{inference.statement}**")
            md.append(f"  *Basis:* {inference.basis}")
            md.append(f"  *Confidence:* {round(inference.confidence * 100)}%")
            md.append(f"  *Risk if wrong:* {inference.risk_if_wrong}")
    else:
        md.append("(none)")
    md.append("")

    md.append("## User-provided facts")
    md.append("")
    md.append(
        "*Quotes below were checked against the submitted text. They show "
        "wording, not proof that the issue exists.*"
    )
    md.append("")
    if user_facts:
        for field in user_facts:
            md.append(_fact_line(field, markdown=True))
    else:
        md.append("(none recorded)")
    md.append("")

    md.append("## AI-inferred details (not reported by you)")
    md.append("")
    if inferred:
        for field in inferred:
            md.append(
                f"- **{FIELD_LABELS[field.key]}:** {field.value} "
                "(inferred by AI; confirm or correct it)"
            )
    else:
        md.append("(none)")
    md.append("")

    md.append("## Confirmed or edited by you")
    md.append("")
    if edited:
        for field in edited:
            md.append(
                f"- **{FIELD_LABELS[field.key]}:** {field.value} ({field.provenance})"
            )
    else:
        md.append("(no edits yet)")
    md.append("")

    md.append("## Unresolved missing information")
    md.append("")
    if unresolved:
        for field in unresolved:
            md.append(f"- **{FIELD_LABELS[field.key]}**")
        md.append("")
        md.append(
            "This report is still incomplete. Answer these before sharing it if "
            "you can."
        )
    else:
        md.append("(none)")
    md.append("")

    md.append("## Conflicts")
    md.append("")
    if conflicts:
        for field in conflicts:
            md.append(
                f"- **{FIELD_LABELS[field.key]}:** {field.value} "
                "(the input contains conflicting details; nothing was chosen for you)"
            )
    else:
        md.append("(none)")
    md.append("")

    if analysis.review_flags:
        md.append("## Review flags")
        md.append("")
        for flag in analysis.review_flags:
            md.append(f"- **[{flag.code}]** {flag.message}")
        md.append("")

    if analysis.emergency.triggered:
        md.append("## ⚠ Safety warning")
        md.append("")
        md.extend(_emergency_block(analysis.emergency))
        md.append("")

    md.append("## Suggested next steps")
    md.append("")
    if analysis.suggested_next_steps:
        for index, step in enumerate(analysis.suggested_next_steps, start=1):
            md.append(f"{index}. {step.action}")
    else:
        md.append("(none)")
    md.append("")

    md.append("## Report completeness")
    md.append("")
    md.append(
        f"{readiness.score}% of the weighted fields are present. "
        "This is completeness only; it is not a trust, accuracy, or "
        "verification score."
    )
    if readiness.blocking_gaps:
        md.append("")
        md.append(
            "**Blocking information still missing:** "
            + ", ".join(FIELD_LABELS[key] for key in readiness.blocking_gaps)
            + "."
        )
    md.append("")
    md.append("---")
    md.append(DISCLAIMER)
    md.append("---")

    # ------------------------------- Plain text -----------------------------
    txt: list[str] = []
    txt.append("CivicBridge AI report draft")
    txt.append("")
    txt.append(f"Issue: {analysis.issue.title}")
    txt.append("")
    txt.append(analysis.issue.summary)
    txt.append("")
    txt.append(
        f"Category: {analysis.issue.category.value.replace('_', ' ').title()}"
    )
    txt.append(f"Tentative severity: {_severity_line(analysis)}")
    txt.append("")

    txt.append("AI inferences (not user-provided facts)")
    txt.append("")
    if analysis.inferences:
        for inference in analysis.inferences:
            txt.append(f"- {inference.statement}")
            txt.append(f"  Basis: {inference.basis}")
            txt.append(f"  Confidence: {round(inference.confidence * 100)}%")
            txt.append(f"  Risk if wrong: {inference.risk_if_wrong}")
    else:
        txt.append("(none)")
    txt.append("")

    txt.append("User-provided facts")
    txt.append("")
    txt.append(
        "Quotes below were checked against the submitted text. They show "
        "wording, not proof that the issue exists."
    )
    txt.append("")
    if user_facts:
        for field in user_facts:
            txt.append(_fact_line(field, markdown=False))
    else:
        txt.append("(none recorded)")
    txt.append("")

    txt.append("AI-inferred details (not reported by you)")
    txt.append("")
    if inferred:
        for field in inferred:
            txt.append(
                f"- {FIELD_LABELS[field.key]}: {field.value} "
                "(inferred by AI; confirm or correct it)"
            )
    else:
        txt.append("(none)")
    txt.append("")

    txt.append("Confirmed or edited by you")
    txt.append("")
    if edited:
        for field in edited:
            txt.append(
                f"- {FIELD_LABELS[field.key]}: {field.value} ({field.provenance})"
            )
    else:
        txt.append("(no edits yet)")
    txt.append("")

    txt.append("Unresolved missing information")
    txt.append("")
    if unresolved:
        for field in unresolved:
            txt.append(f"- {FIELD_LABELS[field.key]}")
        txt.append("")
        txt.append(
            "This report is still incomplete. Answer these before sharing it if "
            "you can."
        )
    else:
        txt.append("(none)")
    txt.append("")

    txt.append("Conflicts")
    txt.append("")
    if conflicts:
        for field in conflicts:
            txt.append(
                f"- {FIELD_LABELS[field.key]}: {field.value} "
                "(the input contains conflicting details; nothing was chosen for you)"
            )
    else:
        txt.append("(none)")
    txt.append("")

    if analysis.review_flags:
        txt.append("Review flags")
        txt.append("")
        for flag in analysis.review_flags:
            txt.append(f"- [{flag.code}] {flag.message}")
        txt.append("")

    if analysis.emergency.triggered:
        txt.append("SAFETY WARNING")
        txt.append("")
        txt.extend(_emergency_block(analysis.emergency))
        txt.append("")

    txt.append("Suggested next steps")
    txt.append("")
    if analysis.suggested_next_steps:
        for index, step in enumerate(analysis.suggested_next_steps, start=1):
            txt.append(f"{index}. {step.action}")
    else:
        txt.append("(none)")
    txt.append("")

    txt.append("Report completeness")
    txt.append("")
    txt.append(
        f"{readiness.score}% of the weighted fields are present. "
        "This is completeness only; it is not a trust, accuracy, or "
        "verification score."
    )
    if readiness.blocking_gaps:
        txt.append("")
        txt.append(
            "Blocking information still missing: "
            + ", ".join(FIELD_LABELS[key] for key in readiness.blocking_gaps)
            + "."
        )
    txt.append("")
    txt.append("---")
    txt.append(DISCLAIMER)
    txt.append("---")

    return "\n".join(md), "\n".join(txt), readiness


def _safe_filename(analysis: AnalysisResponse) -> str:
    category = analysis.issue.category.value.replace("_", "-")
    short_id = re.sub(r"[^a-zA-Z0-9]", "", analysis.request_id)[:8] or "draft"
    return f"civicbridge-report-{short_id}-{category}.md"


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def generate_report(request: ReportRequest) -> ReportResponse:
    """Generate a deterministic Markdown + plain-text report.

    No Gemini call is made, and nothing the client sends is trusted: readiness
    and blocking state are recalculated from the resolved fields.
    """

    analysis = request.analysis
    draft_payload = {
        key: draft.model_dump() for key, draft in (request.drafts or {}).items()
    }

    try:
        markdown, text_report, readiness = _build_report_content(
            analysis,
            draft_payload,
            request.user_answers or {},
        )
    except ValueError as exc:  # pragma: no cover - defensive
        raise ValueError(f"Invalid analysis payload: {exc}") from exc
    except Exception as exc:  # pragma: no cover - defensive
        raise ValueError(f"Invalid analysis payload: {exc}") from exc

    return ReportResponse(
        request_id=analysis.request_id,
        report_md=markdown,
        report_text=text_report,
        filename=_safe_filename(analysis),
        readiness=readiness,
        blocking_remaining=bool(readiness.blocking_gaps),
    )
