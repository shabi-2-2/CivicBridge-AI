import copy
import json
from collections import deque
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.analysis import get_analysis_service
from app.core.config import Settings, get_settings
from app.core.errors import (
    GeminiInvalidOutput,
    GeminiNotConfigured,
    GeminiRateLimited,
    GeminiTimeout,
)
from app.main import app
from app.schemas.analysis import (
    AnalyzeRequest,
    ExtractedField,
    FieldKey,
    GeminiAnalysis,
    IssueCategory,
)
from app.services.analysis import AnalysisService
from app.services.derived import compute_readiness
from app.services.evidence import validate_evidence
from app.services.gemini import (
    GeminiClient,
    _raise_safe_provider_error,
)

RICH_TEXT = (
    "There is a deep pothole outside the community market on Market Road in "
    "Springfield. It has been there since Monday and cars keep swerving into the "
    "opposite lane to avoid it. The hole is about a metre wide. The postcode is "
    "12345 and the site is accessible from the main road."
)

VALID_REQUEST = {"text": RICH_TEXT, "location_hint": "Ward 5, Springfield"}


class FakeClient:
    def __init__(
        self,
        outputs: list[str] | None = None,
        error: Exception | None = None,
    ) -> None:
        self.outputs = deque(outputs or [])
        self.error = error
        self.calls: list[dict] = []

    def generate(self, *, system_instruction: str, user_input: str, schema: dict) -> str:
        self.calls.append(
            {
                "system_instruction": system_instruction,
                "user_input": user_input,
                "schema": schema,
            }
        )
        if self.error is not None:
            raise self.error
        return self.outputs.popleft()


def _field(
    key: str,
    *,
    value: str | None = None,
    status: str = "missing",
    confidence: float | None = None,
    quote: str | None = None,
    rationale: str | None = None,
) -> dict:
    return {
        "key": key,
        "value": value,
        "status": status,
        "confidence": confidence,
        "evidence_quote": quote,
        "rationale": rationale,
    }


def valid_payload() -> dict:
    return {
        "schema_version": "1.0",
        "input_language": "en",
        "issue": {
            "category": "pothole",
            "title": "Deep pothole on Market Road",
            "summary": (
                "A deep pothole outside the community market is causing cars to "
                "swerve into the opposite lane."
            ),
            "severity_suggestion": "high",
            "severity_rationale": "The pothole is deep and affects moving traffic.",
            "is_emergency_suspected": False,
            "emergency_reason": None,
        },
        "fields": [
            _field(
                "issue.description",
                value="A deep pothole outside the community market",
                status="provided",
                confidence=0.95,
                quote="deep pothole outside the community market",
            ),
            _field(
                "issue.first_observed",
                value="Since Monday",
                status="provided",
                confidence=0.9,
                quote="since Monday",
            ),
            _field(
                "issue.frequency",
                value="Ongoing",
                status="inferred",
                confidence=0.5,
                rationale="It has been present since Monday and is still described as there.",
            ),
            _field(
                "issue.scale",
                value="About a metre wide",
                status="provided",
                confidence=0.9,
                quote="about a metre wide",
            ),
            _field(
                "issue.impact",
                value="Cars are swerving into the opposite lane",
                status="provided",
                confidence=0.9,
                quote="cars keep swerving into the opposite lane",
            ),
            _field(
                "issue.hazard",
                value="Potential collision risk",
                status="inferred",
                confidence=0.6,
                rationale="Swerving traffic suggests a possible safety risk.",
            ),
            _field(
                "location.street_or_landmark",
                value="Market Road",
                status="provided",
                confidence=0.95,
                quote="Market Road",
            ),
            _field(
                "location.city_or_district",
                value="Springfield",
                status="provided",
                confidence=0.9,
                quote="Springfield",
            ),
            _field(
                "location.postal_code",
                value="12345",
                status="provided",
                confidence=0.9,
                quote="12345",
            ),
            _field(
                "issue.access_notes",
                value="Accessible from the main road",
                status="provided",
                confidence=0.85,
                quote="accessible from the main road",
            ),
        ],
        "inferences": [
            {
                "statement": "The pothole is likely to worsen with rain.",
                "basis": "Potholes commonly expand when water enters the surface.",
                "confidence": 0.45,
                "risk_if_wrong": "Urgency may be overstated.",
            }
        ],
        "photo_observations": [],
    }


def payload_json(payload: dict | None = None) -> str:
    return json.dumps(payload if payload is not None else valid_payload())


def field_by_key(payload: dict, key: str) -> dict:
    for item in payload["fields"]:
        if item["key"] == key:
            return item
    raise AssertionError(f"missing test field {key}")


@pytest.fixture
def api_client():
    app.dependency_overrides.clear()
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def override_service(fake: FakeClient) -> AnalysisService:
    service = AnalysisService(
        client=fake,
        model="gemini-test",
        prompt_version="test-v1",
    )
    app.dependency_overrides[get_analysis_service] = lambda: service
    return service


def test_valid_request_returns_structured_draft(api_client: TestClient) -> None:
    fake = FakeClient([payload_json()])
    override_service(fake)

    response = api_client.post("/api/v1/analyze", json=VALID_REQUEST)

    assert response.status_code == 200
    body = response.json()
    assert body["schema_version"] == "1.0"
    assert body["input_language"] == "en"
    assert len(body["fields"]) == 10
    assert set(body["fields"]) == {key.value for key in FieldKey}
    assert body["fields"]["issue.description"]["status"] == "provided"
    assert body["fields"]["issue.frequency"]["status"] == "inferred"
    assert body["photo_observations"] == []
    assert body["readiness"]["score"] == 100
    assert body["readiness"]["label"] == "Report completeness"
    assert body["review_flags"] == []
    assert body["emergency"]["triggered"] is False
    assert body["meta"]["model"] == "gemini-test"
    assert body["meta"]["prompt_version"] == "test-v1"
    assert "Not officially verified" in body["meta"]["disclaimer"]
    assert response.headers["X-Request-ID"] == body["request_id"]
    assert len(fake.calls) == 1
    assert "untrusted" in fake.calls[0]["system_instruction"].lower()


@pytest.mark.parametrize(
    "payload",
    [
        {"text": "too short"},
        {"text": "x" * 2001},
        {"text": RICH_TEXT, "location_hint": "x" * 201},
        {"location_hint": "Springfield"},
        {"text": RICH_TEXT, "unexpected": "not allowed"},
    ],
)
def test_invalid_requests_are_rejected(
    api_client: TestClient, payload: dict
) -> None:
    fake = FakeClient([payload_json()])
    override_service(fake)

    response = api_client.post("/api/v1/analyze", json=payload)

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "INVALID_INPUT"
    assert body["error"]["retryable"] is False
    assert body["error"]["details"]
    assert fake.calls == []


def test_validation_errors_do_not_echo_user_text(api_client: TestClient) -> None:
    marker = "UNIQUE-USER-TEXT-MARKER"
    response = api_client.post(
        "/api/v1/analyze",
        json={"text": marker + "x" * 1990, "location_hint": "Springfield"},
    )

    assert response.status_code == 422
    assert marker not in response.text


def test_repair_retry_recovers_from_malformed_output(
    api_client: TestClient,
) -> None:
    fake = FakeClient(["this is not json", payload_json()])
    override_service(fake)

    response = api_client.post("/api/v1/analyze", json=VALID_REQUEST)

    assert response.status_code == 200
    assert len(fake.calls) == 2
    assert "REPAIR REQUIRED" in fake.calls[1]["user_input"]


def test_two_malformed_outputs_return_safe_error(api_client: TestClient) -> None:
    fake = FakeClient(["not json", "still not json"])
    override_service(fake)

    response = api_client.post("/api/v1/analyze", json=VALID_REQUEST)

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "GEMINI_INVALID_OUTPUT"
    assert response.json()["error"]["retryable"] is True
    assert len(fake.calls) == 2


def test_model_output_missing_required_field_is_repaired(
    api_client: TestClient,
) -> None:
    missing_fields = valid_payload()
    del missing_fields["fields"]
    fake = FakeClient([json.dumps(missing_fields), payload_json()])
    override_service(fake)

    response = api_client.post("/api/v1/analyze", json=VALID_REQUEST)

    assert response.status_code == 200
    assert len(fake.calls) == 2


def test_fabricated_evidence_quote_is_downgraded(
    api_client: TestClient,
) -> None:
    payload = valid_payload()
    description = field_by_key(payload, "issue.description")
    description["evidence_quote"] = "a pothole the size of a car"
    description["confidence"] = 0.95
    fake = FakeClient([json.dumps(payload)])
    override_service(fake)

    response = api_client.post("/api/v1/analyze", json=VALID_REQUEST)

    assert response.status_code == 200
    body = response.json()
    downgraded = body["fields"]["issue.description"]
    assert downgraded["status"] == "inferred"
    assert downgraded["confidence"] <= 0.5
    assert downgraded["evidence_quote"] is None
    assert any(
        flag["code"] == "EVIDENCE_UNVERIFIED"
        and flag["field_key"] == "issue.description"
        for flag in body["review_flags"]
    )


def test_valid_evidence_quote_stays_provided(api_client: TestClient) -> None:
    fake = FakeClient([payload_json()])
    override_service(fake)

    response = api_client.post("/api/v1/analyze", json=VALID_REQUEST)

    field = response.json()["fields"]["issue.description"]
    assert field["status"] == "provided"
    assert "deep pothole" in field["evidence_quote"]


def test_missing_location_is_reported(api_client: TestClient) -> None:
    payload = valid_payload()
    for key in ("location.street_or_landmark", "location.city_or_district"):
        location = field_by_key(payload, key)
        location.update(
            {
                "value": None,
                "status": "missing",
                "confidence": None,
                "evidence_quote": None,
                "rationale": None,
            }
        )
    fake = FakeClient([json.dumps(payload)])
    override_service(fake)

    response = api_client.post("/api/v1/analyze", json=VALID_REQUEST)

    assert response.status_code == 200
    body = response.json()
    missing = {item["key"]: item for item in body["missing_information"]}
    assert missing["location.street_or_landmark"]["priority"] == "blocking"
    assert missing["location.city_or_district"]["priority"] == "blocking"
    assert body["readiness"]["score"] < 100
    assert "location.street_or_landmark" in body["readiness"]["blocking_gaps"]


def test_conflicting_information_is_flagged_and_capped(
    api_client: TestClient,
) -> None:
    payload = valid_payload()
    city = field_by_key(payload, "location.city_or_district")
    city.update(
        {
            "value": "Springfield / Riverton",
            "status": "conflicting",
            "confidence": 0.4,
            "evidence_quote": None,
            "rationale": "The text names two different cities.",
        }
    )
    fake = FakeClient([json.dumps(payload)])
    override_service(fake)

    response = api_client.post("/api/v1/analyze", json=VALID_REQUEST)

    assert response.status_code == 200
    body = response.json()
    assert body["fields"]["location.city_or_district"]["status"] == "conflicting"
    assert body["readiness"]["conflict_cap_applied"] is True
    assert body["readiness"]["score"] == 80
    assert any(
        flag["code"] == "CONFLICTING_INFORMATION"
        for flag in body["review_flags"]
    )


def test_emergency_rule_overrides_model_false_negative(
    api_client: TestClient,
) -> None:
    payload = valid_payload()
    fake = FakeClient([json.dumps(payload)])
    override_service(fake)

    response = api_client.post(
        "/api/v1/analyze",
        json={
            "text": RICH_TEXT + " There is also a strong smell of gas near the school.",
            "location_hint": "Ward 5, Springfield",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["emergency"]["triggered"] is True
    assert body["emergency"]["model_flagged"] is False
    assert "possible gas leak" in body["emergency"]["matched_rules"]
    assert body["issue"]["is_emergency_suspected"] is True
    assert body["issue"]["emergency_reason"].startswith("Deterministic safety rule")
    assert body["emergency"]["contacts_emergency_services"] is False


def test_missing_api_key_returns_actionable_error(api_client: TestClient) -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None,
        gemini_api_key=None,
    )

    response = api_client.post("/api/v1/analyze", json=VALID_REQUEST)

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "GEMINI_NOT_CONFIGURED"
    assert "GEMINI_API_KEY" in response.json()["error"]["message"]
    assert response.json()["error"]["retryable"] is False


def test_timeout_returns_safe_error(api_client: TestClient) -> None:
    fake = FakeClient(error=GeminiTimeout())
    override_service(fake)

    response = api_client.post("/api/v1/analyze", json=VALID_REQUEST)

    assert response.status_code == 504
    assert response.json()["error"]["code"] == "GEMINI_TIMEOUT"
    assert response.json()["error"]["retryable"] is True
    assert len(fake.calls) == 1


def test_readiness_formula_and_conflict_cap() -> None:
    analysis = GeminiAnalysis.model_validate(valid_payload())
    fields = {field.key: field for field in analysis.fields}

    readiness = compute_readiness(IssueCategory.POTHOLE, fields)
    assert readiness.score == 100
    assert readiness.filled_weight == readiness.total_weight
    assert readiness.conflict_cap_applied is False

    fields[FieldKey.LOCATION_CITY] = fields[FieldKey.LOCATION_CITY].model_copy(
        update={
            "status": "conflicting",
            "value": "Springfield / Riverton",
            "rationale": "Two locations are named.",
        }
    )
    capped = compute_readiness(IssueCategory.POTHOLE, fields)
    assert capped.score == 80
    assert capped.conflict_cap_applied is True


def test_missing_field_readiness_is_weighted() -> None:
    analysis = GeminiAnalysis.model_validate(valid_payload())
    fields = {field.key: field for field in analysis.fields}
    fields[FieldKey.ISSUE_ACCESS_NOTES] = fields[
        FieldKey.ISSUE_ACCESS_NOTES
    ].model_copy(
        update={
            "status": "missing",
            "value": None,
            "confidence": None,
            "evidence_quote": None,
            "rationale": None,
        }
    )

    readiness = compute_readiness(IssueCategory.POTHOLE, fields)

    # Pothole catalog total is 23; the optional access note weighs 1.
    assert readiness.total_weight == 23
    assert readiness.filled_weight == 22
    assert readiness.score == 96


def test_evidence_validation_is_case_and_whitespace_insensitive() -> None:
    field = ExtractedField(
        key=FieldKey.ISSUE_DESCRIPTION,
        value="Deep pothole",
        status="provided",
        confidence=0.9,
        evidence_quote="  DEEP   pothole ",
        rationale=None,
    )

    result = validate_evidence([field], "There is a deep pothole here.", None)

    assert result.fields[0].status == "provided"
    assert result.review_flags == []


def test_evidence_quote_can_come_from_location_hint() -> None:
    field = ExtractedField(
        key=FieldKey.LOCATION_CITY,
        value="Springfield",
        status="provided",
        confidence=0.9,
        evidence_quote="springfield",
        rationale=None,
    )

    result = validate_evidence([field], "The road is damaged.", "Ward 5, SPRINGFIELD")

    assert result.fields[0].status == "provided"
    assert result.review_flags == []


def test_gemini_client_uses_timeout_and_structured_format() -> None:
    client = GeminiClient(api_key="test-key", model="test-model", timeout_seconds=15)
    captured: dict = {}

    class FakeInteractions:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(output_text='{"ok": true}')

    client._client = SimpleNamespace(interactions=FakeInteractions())  # type: ignore[assignment]

    output = client.generate(
        system_instruction="system",
        user_input="data",
        schema={"type": "object"},
    )

    assert output == '{"ok": true}'
    assert captured["timeout"] == 15
    assert captured["response_format"]["mime_type"] == "application/json"
    assert captured["response_format"]["schema"] == {"type": "object"}


def test_gemini_client_rejects_missing_key() -> None:
    with pytest.raises(GeminiNotConfigured):
        GeminiClient(api_key="   ")


def test_schema_rejects_unexpected_and_duplicate_keys() -> None:
    payload = valid_payload()
    payload["unexpected"] = True
    with pytest.raises(ValidationError):
        GeminiAnalysis.model_validate(payload)

    duplicate = valid_payload()
    duplicate["fields"][1] = copy.deepcopy(duplicate["fields"][0])
    with pytest.raises(ValidationError):
        GeminiAnalysis.model_validate(duplicate)


def test_analyze_request_strips_blank_location() -> None:
    request = AnalyzeRequest(text=RICH_TEXT, location_hint="   ")
    assert request.location_hint is None


def test_rate_limit_is_mapped_safely() -> None:
    from google.genai import errors

    error = errors.APIError(
        429,
        {"error": {"message": "quota exceeded", "status": "RESOURCE_EXHAUSTED"}},
    )

    with pytest.raises(GeminiRateLimited):
        _raise_safe_provider_error(error)


def test_invalid_output_error_contract() -> None:
    error = GeminiInvalidOutput()
    assert error.status_code == 502
    assert "after one repair" in error.message
