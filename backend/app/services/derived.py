from dataclasses import dataclass

from app.schemas.analysis import (
    EmergencyNotice,
    ExtractedField,
    FieldKey,
    FieldStatus,
    IssueCategory,
    MissingInformation,
    NextStep,
    NextStepChannel,
    Readiness,
    ReviewFlag,
    ReviewSeverity,
)
from app.services.catalog import CATEGORY_GUIDANCE, catalog_for
from app.services.emergency import EMERGENCY_MESSAGE, EmergencyDetection

FILLED_STATUSES = {FieldStatus.PROVIDED, FieldStatus.INFERRED}


@dataclass(frozen=True)
class DerivedData:
    missing_information: list[MissingInformation]
    review_flags: list[ReviewFlag]
    readiness: Readiness
    suggested_next_steps: list[NextStep]
    emergency: EmergencyNotice


def _is_filled(field: ExtractedField) -> bool:
    return bool(field.value and field.value.strip()) and field.status in FILLED_STATUSES


def compute_readiness(
    category: IssueCategory,
    fields: dict[FieldKey, ExtractedField],
) -> Readiness:
    specs = catalog_for(category)
    total_weight = sum(spec.weight for spec in specs)
    filled_weight = sum(
        spec.weight for spec in specs if _is_filled(fields[spec.key])
    )

    score = (100 * filled_weight + total_weight // 2) // total_weight
    has_conflict = any(
        fields[spec.key].status == FieldStatus.CONFLICTING for spec in specs
    )
    conflict_cap_applied = has_conflict and score > 80
    if conflict_cap_applied:
        score = 80

    blocking_gaps = [
        spec.key
        for spec in specs
        if spec.weight >= 3
        and fields[spec.key].status in {FieldStatus.MISSING, FieldStatus.CONFLICTING}
    ]

    return Readiness(
        score=score,
        filled_weight=filled_weight,
        total_weight=total_weight,
        blocking_gaps=blocking_gaps,
        conflict_cap_applied=conflict_cap_applied,
    )


def build_missing_information(
    category: IssueCategory,
    fields: dict[FieldKey, ExtractedField],
) -> list[MissingInformation]:
    return [
        MissingInformation(
            key=spec.key,
            label=spec.label,
            question=spec.question,
            priority=spec.priority,
            reason=spec.reason,
        )
        for spec in catalog_for(category)
        if fields[spec.key].status == FieldStatus.MISSING
    ]


def build_review_flags(
    fields: dict[FieldKey, ExtractedField],
    evidence_flags: list[ReviewFlag],
) -> list[ReviewFlag]:
    flags = list(evidence_flags)

    for key in FieldKey:
        field = fields[key]
        if field.status == FieldStatus.CONFLICTING:
            flags.append(
                ReviewFlag(
                    code="CONFLICTING_INFORMATION",
                    field_key=key,
                    severity=ReviewSeverity.WARNING,
                    message=(
                        f"The input contains conflicting information for '{key.value}'. "
                        "CivicBridge AI preserved it instead of choosing a value. "
                        "Review and confirm which detail is correct."
                    ),
                )
            )
        elif (
            field.status == FieldStatus.INFERRED
            and field.confidence is not None
            and field.confidence < 0.4
        ):
            flags.append(
                ReviewFlag(
                    code="LOW_CONFIDENCE_INFERENCE",
                    field_key=key,
                    severity=ReviewSeverity.INFO,
                    message=(
                        f"'{key.value}' is a low-confidence inference. Check it before "
                        "including it in a report."
                    ),
                )
            )

    return flags


def build_next_steps(
    category: IssueCategory,
    fields: dict[FieldKey, ExtractedField],
    readiness: Readiness,
    emergency: EmergencyNotice,
) -> list[NextStep]:
    actions: list[tuple[str, NextStepChannel]] = []

    if emergency.triggered:
        actions.append(
            (
                "If anyone is in immediate danger, contact your local emergency "
                "services or the relevant utility now. CivicBridge AI has not "
                "contacted anyone.",
                NextStepChannel.EMERGENCY_SERVICES,
            )
        )

    if readiness.blocking_gaps:
        actions.append(
            (
                "Answer the blocking questions before sharing the report: "
                + ", ".join(key.value for key in readiness.blocking_gaps)
                + ".",
                NextStepChannel.OTHER,
            )
        )

    if any(
        field.status in {FieldStatus.INFERRED, FieldStatus.CONFLICTING}
        for field in fields.values()
    ):
        actions.append(
            (
                "Review every field labelled 'inferred' or 'conflicting' and correct "
                "anything that is wrong.",
                NextStepChannel.OTHER,
            )
        )

    guidance, channel = CATEGORY_GUIDANCE[category]
    actions.append((guidance, NextStepChannel(channel)))

    actions.append(
        (
            "Send the finished report through the official channel yourself and keep "
            "any reference number you receive.",
            NextStepChannel.OTHER,
        )
    )

    return [
        NextStep(order=index, action=action, channel=channel)
        for index, (action, channel) in enumerate(actions[:5], start=1)
    ]


def build_derived_data(
    category: IssueCategory,
    fields: dict[FieldKey, ExtractedField],
    evidence_flags: list[ReviewFlag],
    detection: EmergencyDetection,
    model_emergency_flag: bool,
) -> DerivedData:
    readiness = compute_readiness(category, fields)
    review_flags = build_review_flags(fields, evidence_flags)
    triggered = detection.triggered or model_emergency_flag
    emergency = EmergencyNotice(
        triggered=triggered,
        model_flagged=model_emergency_flag,
        matched_rules=list(detection.matched_labels),
        message=EMERGENCY_MESSAGE if triggered else None,
    )

    return DerivedData(
        missing_information=build_missing_information(category, fields),
        review_flags=review_flags,
        readiness=readiness,
        suggested_next_steps=build_next_steps(
            category, fields, readiness, emergency
        ),
        emergency=emergency,
    )
