import logging
from datetime import datetime, timezone

from pydantic import ValidationError

from app.core.errors import GeminiInvalidOutput
from app.schemas.analysis import (
    AnalysisMeta,
    AnalysisResponse,
    AnalyzeRequest,
    GeminiAnalysis,
    IssueExtraction,
    SCHEMA_VERSION,
)
from app.services.derived import build_derived_data
from app.services.emergency import EmergencyDetection, detect_emergency
from app.services.evidence import validate_evidence
from app.services.gemini import StructuredModelClient
from app.services.prompt import (
    PROMPT_VERSION,
    SYSTEM_INSTRUCTION,
    build_repair_input,
    build_user_input,
    response_schema,
)

logger = logging.getLogger(__name__)


class AnalysisService:
    def __init__(
        self,
        *,
        client: StructuredModelClient,
        model: str,
        prompt_version: str = PROMPT_VERSION,
    ) -> None:
        self._client = client
        self._model = model
        self._prompt_version = prompt_version
        self._schema = response_schema()

    def analyze(self, request: AnalyzeRequest, request_id: str) -> AnalysisResponse:
        user_input = build_user_input(request.text, request.location_hint)
        analysis = self._extract_with_one_repair(user_input)

        evidence = validate_evidence(
            analysis.fields, request.text, request.location_hint
        )
        fields = {field.key: field for field in evidence.fields}

        detection = detect_emergency(request.text, request.location_hint)
        derived = build_derived_data(
            category=analysis.issue.category,
            fields=fields,
            evidence_flags=evidence.review_flags,
            detection=detection,
            model_emergency_flag=analysis.issue.is_emergency_suspected,
        )

        issue = self._merge_emergency(analysis.issue, detection, derived.emergency.triggered)

        logger.info(
            "analysis derived request_id=%s category=%s readiness=%s flags=%s",
            request_id,
            issue.category.value,
            derived.readiness.score,
            len(derived.review_flags),
        )

        return AnalysisResponse(
            schema_version=SCHEMA_VERSION,
            request_id=request_id,
            input_language=analysis.input_language,
            issue=issue,
            fields=fields,
            inferences=analysis.inferences,
            photo_observations=analysis.photo_observations,
            missing_information=derived.missing_information,
            review_flags=derived.review_flags,
            readiness=derived.readiness,
            suggested_next_steps=derived.suggested_next_steps,
            emergency=derived.emergency,
            meta=AnalysisMeta(
                model=self._model,
                prompt_version=self._prompt_version,
                generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            ),
        )

    def _extract_with_one_repair(self, user_input: str) -> GeminiAnalysis:
        raw = self._client.generate(
            system_instruction=SYSTEM_INSTRUCTION,
            user_input=user_input,
            schema=self._schema,
        )

        try:
            return GeminiAnalysis.model_validate_json(raw)
        except ValidationError as first_error:
            logger.info("gemini output invalid; attempting single repair")
            repair_input = build_repair_input(user_input, first_error, raw)

        repaired = self._client.generate(
            system_instruction=SYSTEM_INSTRUCTION,
            user_input=repair_input,
            schema=self._schema,
        )

        try:
            return GeminiAnalysis.model_validate_json(repaired)
        except ValidationError:
            logger.warning("gemini output invalid after repair attempt")
            raise GeminiInvalidOutput() from None

    @staticmethod
    def _merge_emergency(
        issue: IssueExtraction,
        detection: EmergencyDetection,
        triggered: bool,
    ) -> IssueExtraction:
        reason = issue.emergency_reason
        if detection.triggered:
            rule_text = ", ".join(detection.matched_labels)
            prefix = f"Deterministic safety rule matched: {rule_text}."
            reason = f"{prefix} {reason}".strip() if reason else prefix
        elif not triggered:
            reason = None

        return issue.model_copy(
            update={
                "is_emergency_suspected": triggered,
                "emergency_reason": reason[:400] if reason else None,
            }
        )
