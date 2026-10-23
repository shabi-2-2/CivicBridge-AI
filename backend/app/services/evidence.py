from dataclasses import dataclass

from app.schemas.analysis import (
    ExtractedField,
    FieldStatus,
    ReviewFlag,
    ReviewSeverity,
)


def normalize_for_match(value: str) -> str:
    """Normalize whitespace and case only, as required for quote checking."""

    return " ".join(value.split()).casefold()


@dataclass(frozen=True)
class EvidenceValidation:
    fields: list[ExtractedField]
    review_flags: list[ReviewFlag]


def _quote_matches(quote: str, sources: list[str]) -> bool:
    normalized_quote = normalize_for_match(quote)
    if not normalized_quote:
        return False
    return any(normalized_quote in source for source in sources if source)


def validate_evidence(
    fields: list[ExtractedField],
    text: str,
    location_hint: str | None,
) -> EvidenceValidation:
    """Check model-provided quotes against the submitted input.

    Matching a quote does not prove the real-world claim. It only proves that
    the quoted words appear in the user's input.
    """

    sources = [normalize_for_match(text), normalize_for_match(location_hint or "")]
    validated: list[ExtractedField] = []
    flags: list[ReviewFlag] = []

    for field in fields:
        if field.status == FieldStatus.PROVIDED:
            if not _quote_matches(field.evidence_quote or "", sources):
                downgraded = field.model_copy(
                    update={
                        "status": FieldStatus.INFERRED,
                        "confidence": min(field.confidence or 0.0, 0.5),
                        "evidence_quote": None,
                        "rationale": (
                            "The model's evidence quote could not be found in the "
                            "submitted text or location hint, so this field was "
                            "downgraded to an inference."
                        ),
                    }
                )
                validated.append(downgraded)
                flags.append(
                    ReviewFlag(
                        code="EVIDENCE_UNVERIFIED",
                        field_key=field.key,
                        severity=ReviewSeverity.WARNING,
                        message=(
                            f"The evidence quote for '{field.key.value}' could not be "
                            "verified against your input. Treat this detail as an "
                            "inference and check it."
                        ),
                    )
                )
                continue

            validated.append(field)
            continue

        if field.status == FieldStatus.INFERRED:
            confidence = field.confidence
            updates: dict[str, object] = {}
            if confidence is not None and confidence > 0.85:
                updates["confidence"] = 0.85
            if field.evidence_quote and not _quote_matches(
                field.evidence_quote, sources
            ):
                updates["evidence_quote"] = None
            validated.append(field.model_copy(update=updates) if updates else field)
            continue

        if field.status == FieldStatus.CONFLICTING:
            updates = {}
            if field.evidence_quote and not _quote_matches(
                field.evidence_quote, sources
            ):
                updates["evidence_quote"] = None
            validated.append(field.model_copy(update=updates) if updates else field)
            continue

        # Missing fields are already normalized by schema validation.
        validated.append(field)

    return EvidenceValidation(fields=validated, review_flags=flags)
