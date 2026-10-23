from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

SCHEMA_VERSION = "1.0"
DISCLAIMER = (
    "AI-assisted draft. Not officially verified, routed, or submitted. "
    "Review every field before sharing it."
)


class StrictModel(BaseModel):
    """Base model that rejects unexpected properties."""

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )


class IssueCategory(str, Enum):
    POTHOLE = "pothole"
    ROAD_DAMAGE = "road_damage"
    GARBAGE = "garbage"
    STREETLIGHT = "streetlight"
    WATER_LEAK = "water_leak"
    DRAINAGE = "drainage"
    SIDEWALK = "sidewalk"
    OTHER = "other"


class SeveritySuggestion(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class FieldStatus(str, Enum):
    PROVIDED = "provided"
    INFERRED = "inferred"
    MISSING = "missing"
    CONFLICTING = "conflicting"


class FieldKey(str, Enum):
    ISSUE_DESCRIPTION = "issue.description"
    ISSUE_FIRST_OBSERVED = "issue.first_observed"
    ISSUE_FREQUENCY = "issue.frequency"
    ISSUE_SCALE = "issue.scale"
    ISSUE_IMPACT = "issue.impact"
    ISSUE_HAZARD = "issue.hazard"
    LOCATION_STREET = "location.street_or_landmark"
    LOCATION_CITY = "location.city_or_district"
    LOCATION_POSTAL_CODE = "location.postal_code"
    ISSUE_ACCESS_NOTES = "issue.access_notes"


class MissingPriority(str, Enum):
    BLOCKING = "blocking"
    RECOMMENDED = "recommended"
    OPTIONAL = "optional"


class ReviewSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class NextStepChannel(str, Enum):
    EMERGENCY_SERVICES = "emergency_services"
    MUNICIPAL_WEBSITE = "municipal_website"
    MUNICIPAL_PHONE = "municipal_phone"
    UTILITY = "utility"
    IN_PERSON = "in_person"
    OTHER = "other"


class ExtractedField(StrictModel):
    """One canonical complaint field with provenance information."""

    key: FieldKey
    value: str | None = Field(max_length=600)
    status: FieldStatus
    confidence: float | None = Field(ge=0, le=1)
    evidence_quote: str | None = Field(max_length=2000)
    rationale: str | None = Field(max_length=600)

    @model_validator(mode="after")
    def validate_status_consistency(self) -> "ExtractedField":
        if self.status == FieldStatus.MISSING:
            if (
                self.value is not None
                or self.confidence is not None
                or self.evidence_quote is not None
            ):
                raise ValueError(
                    "missing fields must have null value, confidence and evidence_quote"
                )
            return self

        if not self.value or not self.value.strip():
            raise ValueError(f"{self.key} must have a non-empty value unless missing")
        if self.confidence is None:
            raise ValueError(f"{self.key} must include confidence when not missing")

        if self.status == FieldStatus.PROVIDED and not self.evidence_quote:
            raise ValueError(f"{self.key} is provided and requires an evidence_quote")

        if self.status in {FieldStatus.INFERRED, FieldStatus.CONFLICTING}:
            if not self.rationale:
                raise ValueError(
                    f"{self.key} is {self.status.value} and requires a rationale"
                )

        return self


class Inference(StrictModel):
    statement: str = Field(min_length=1, max_length=400)
    basis: str = Field(min_length=1, max_length=400)
    confidence: float = Field(ge=0, le=1)
    risk_if_wrong: str = Field(min_length=1, max_length=300)


class PhotoObservation(StrictModel):
    observation: str = Field(min_length=1, max_length=300)
    confidence: float = Field(ge=0, le=1)


class IssueExtraction(StrictModel):
    category: IssueCategory
    title: str = Field(min_length=3, max_length=120)
    summary: str = Field(min_length=10, max_length=600)
    severity_suggestion: SeveritySuggestion
    severity_rationale: str = Field(min_length=3, max_length=300)
    is_emergency_suspected: bool
    emergency_reason: str | None = Field(max_length=400)

    @model_validator(mode="after")
    def validate_emergency_reason(self) -> "IssueExtraction":
        if self.is_emergency_suspected and not self.emergency_reason:
            raise ValueError(
                "emergency_reason is required when is_emergency_suspected is true"
            )
        return self


class GeminiAnalysis(StrictModel):
    """The only structure accepted from the Gemini provider."""

    schema_version: Literal["1.0"]
    input_language: str = Field(min_length=2, max_length=35)
    issue: IssueExtraction
    fields: list[ExtractedField] = Field(min_length=10, max_length=10)
    inferences: list[Inference] = Field(max_length=10)
    photo_observations: list[PhotoObservation] = Field(max_length=0)

    @model_validator(mode="after")
    def validate_field_keys(self) -> "GeminiAnalysis":
        keys = [field.key for field in self.fields]
        if len(set(keys)) != len(keys):
            raise ValueError("fields must contain each canonical key at most once")
        missing = set(FieldKey) - set(keys)
        if missing:
            missing_list = ", ".join(sorted(key.value for key in missing))
            raise ValueError(f"fields is missing canonical keys: {missing_list}")
        return self


class AnalyzeRequest(StrictModel):
    text: str = Field(
        min_length=20,
        max_length=2000,
        description="The resident's unstructured civic complaint.",
    )
    location_hint: str | None = Field(
        default=None,
        max_length=200,
        description="Optional street, landmark, or neighbourhood supplied by the user.",
    )

    @model_validator(mode="after")
    def validate_text_is_not_blank(self) -> "AnalyzeRequest":
        if len(self.text.strip()) < 20:
            raise ValueError("text must contain at least 20 non-whitespace characters")
        if self.location_hint is not None:
            cleaned = self.location_hint.strip()
            self.location_hint = cleaned or None
        return self


class MissingInformation(StrictModel):
    key: FieldKey
    label: str
    question: str
    priority: MissingPriority
    reason: str


class ReviewFlag(StrictModel):
    code: str = Field(pattern=r"^[A-Z][A-Z_]*$")
    field_key: FieldKey | None = None
    severity: ReviewSeverity
    message: str = Field(min_length=1, max_length=400)


class Readiness(StrictModel):
    score: int = Field(ge=0, le=100)
    label: Literal["Report completeness"] = "Report completeness"
    filled_weight: int = Field(ge=0)
    total_weight: int = Field(gt=0)
    blocking_gaps: list[FieldKey]
    conflict_cap_applied: bool
    note: str = (
        "Completeness only; this is not a trust, accuracy, or verification score."
    )


class NextStep(StrictModel):
    order: int = Field(ge=1, le=10)
    action: str = Field(min_length=1, max_length=300)
    channel: NextStepChannel
    is_generic_guidance: Literal[True] = True


class EmergencyNotice(StrictModel):
    triggered: bool
    model_flagged: bool
    matched_rules: list[str]
    message: str | None = Field(default=None, max_length=400)
    contacts_emergency_services: Literal[False] = False


class AnalysisMeta(StrictModel):
    model: str
    prompt_version: str
    generated_at: str
    needs_human_review: Literal[True] = True
    disclaimer: str = DISCLAIMER


class AnalysisResponse(StrictModel):
    schema_version: Literal["1.0"] = SCHEMA_VERSION
    request_id: str
    input_language: str
    issue: IssueExtraction
    fields: dict[FieldKey, ExtractedField]
    inferences: list[Inference]
    photo_observations: list[PhotoObservation]
    missing_information: list[MissingInformation]
    review_flags: list[ReviewFlag]
    readiness: Readiness
    suggested_next_steps: list[NextStep]
    emergency: EmergencyNotice
    meta: AnalysisMeta


class ValidationIssue(StrictModel):
    field: str
    message: str


class ErrorDetail(StrictModel):
    code: str
    message: str
    request_id: str
    retryable: bool
    details: list[ValidationIssue] | None = None


class ErrorResponse(StrictModel):
    error: ErrorDetail
