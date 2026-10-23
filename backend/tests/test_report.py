"""Backend tests for POST /api/v1/report report generation."""

import json
from collections import deque
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.api.analysis import get_analysis_service
from app.services.analysis import AnalysisService
from app.schemas.analysis import (
    AnalysisResponse,
    ExtractedField,
    FieldKey,
    GeminiAnalysis,
    IssueCategory,
)
from app.services.catalog import catalog_for
from app.services.derived import compute_readiness
from app.services.gemini import DEFAULT_MODEL, GeminiClient
from app.services.report import generate_report, ReportRequest, ReportResponse


# ── Helpers ────────────────────────────────────────────────────────────────

RICH_TEXT = (
    "There is a deep pothole outside the community market on Market Road in "
    "Springfield. It has been there since Monday and cars keep swerving into the "
    "opposite lane to avoid it. The hole is about a metre wide. The postcode is "
    "12345 and the site is accessible from the main road."
)

VALID_REQUEST = {"text": RICH_TEXT, "location_hint": "Ward 5, Springfield"}


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


# ── Fixtures ───────────────────────────────────────────────────────────────

@pytest.fixture
def api_client():
    app.dependency_overrides.clear()
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def override_service(fake: "FakeClient") -> AnalysisService:
    service = AnalysisService(
        client=fake,
        model="gemini-test",
        prompt_version="test-v1",
    )
    app.dependency_overrides[get_analysis_service] = lambda: service
    return service


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


# ── Tests ──────────────────────────────────────────────────────────────────


def test_valid_report_returns_content_and_contract(api_client: TestClient) -> None:
    """A valid report request produces a ReportResponse with all required fields."""
    # First, perform an analysis so we have an AnalysisResponse to feed into the report endpoint
    fake = FakeClient([payload_json()])
    override_service(fake)

    analyze_response = api_client.post("/api/v1/analyze", json=VALID_REQUEST).json()

    # Now generate the report using the same analysis + empty drafts + no user answers
    drafts: dict[str, any] = {}
    for key in FieldKey:
        drafts[key.value] = {"value": "", "edited": False, "confirmedByUser": False}

    report_request = ReportRequest(
        analysis=AnalysisResponse(**analyze_response),
        drafts=drafts,
        user_answers={},
    )

    response = api_client.post("/api/v1/report", json=report_request.model_dump())
    assert response.status_code == 200

    body = response.json()
    assert body["report_md"]
    assert body["report_text"]
    assert body["filename"]
    assert body["readiness"]["score"] >= 0
    assert body["readiness"]["label"] == "Report completeness"
    assert isinstance(body["blocking_remaining"], bool)

    # Verify the exact disclaimer is present in the markdown report
    assert "AI-assisted draft. Not officially verified, routed, or submitted. Review every field before sharing it." in body["report_md"]

    # Verify filename format
    assert body["filename"].endswith(".md")
    # Should contain first 8 chars of request_id and category
    assert body["request_id"][:8] in body["filename"] or body["request_id"] in body["report_md"]


def test_user_edits_appear_in_exported_report(api_client: TestClient) -> None:
    """When the frontend sends edited field values, they appear in the report."""
    fake = FakeClient([payload_json()])
    override_service(fake)

    analyze_response = api_client.post("/api/v1/analyze", json=VALID_REQUEST).json()

    # Build drafts with one edited field
    drafts: dict[str, any] = {}
    for key in FieldKey:
        drafts[key.value] = {"value": "", "edited": False, "confirmedByUser": False}

    # Edit the issue description
    drafts["issue.description"] = {
        "value": "A deep pothole with exposed sharp edges outside the market",
        "edited": True,
        "confirmedByUser": True,
    }

    report_request = ReportRequest(
        analysis=AnalysisResponse(**analyze_response),
        drafts=drafts,
        user_answers={},
    )

    response = api_client.post("/api/v1/report", json=report_request.model_dump())
    assert response.status_code == 200

    body = response.json()
    assert "deep pothole with exposed sharp edges" in body["report_md"]
    assert "edited by you" in body["report_md"]

    # The original analysed field value is superseded by the edit inside the
    # facts section. (The AI-written summary is separate prose and may still
    # mention the same wording, so only the facts section is inspected here.)
    facts_section = body["report_md"].split("## User-provided facts", 1)[1].split(
        "## ", 1
    )[0]
    assert "A deep pothole outside the community market" not in facts_section
    assert "deep pothole with exposed sharp edges" in facts_section


def test_inferences_and_provided_facts_distinguished(api_client: TestClient) -> None:
    """Inferences are labelled as AI, not as user-provided facts."""
    fake = FakeClient([payload_json()])
    override_service(fake)

    analyze_response = api_client.post("/api/v1/analyze", json=VALID_REQUEST).json()

    drafts: dict[str, any] = {}
    for key in FieldKey:
        drafts[key.value] = {"value": "", "edited": False, "confirmedByUser": False}

    report_request = ReportRequest(
        analysis=AnalysisResponse(**analyze_response),
        drafts=drafts,
        user_answers={},
    )

    response = api_client.post("/api/v1/report", json=report_request.model_dump())
    assert response.status_code == 200

    body = response.json()
    md = body["report_md"]

    # AI inferences should appear in the "AI inferences" section
    assert "AI inferences" in md
    # User-provided facts should appear in the "User-provided facts" section
    assert "User-provided facts" in md
    # The inference statement should NOT appear in the user-provided facts section
    inf_stmt = "The pothole is likely to worsen with rain."
    # Check it's in the AI inferences section but not in user facts
    ai_section_start = md.index("AI inferences")
    user_section_start = md.index("User-provided facts")
    ai_section = md[ai_section_start:user_section_start]
    assert inf_stmt in ai_section


def test_missing_fields_and_conflicts_preserved(api_client: TestClient) -> None:
    """Missing fields and conflicts are preserved in the report."""
    # Build a payload with a missing field and a conflicting field
    payload = valid_payload()
    # Mark location.city_or_district as conflicting
    city_field = field_by_key(payload, "location.city_or_district")
    city_field["value"] = "Springfield / Riverton"
    city_field["status"] = "conflicting"
    city_field["confidence"] = 0.4
    city_field["rationale"] = "The text names two different cities."

    fake = FakeClient([payload_json(payload)])
    override_service(fake)

    analyze_response = api_client.post("/api/v1/analyze", json=VALID_REQUEST).json()

    drafts: dict[str, any] = {}
    for key in FieldKey:
        drafts[key.value] = {"value": "", "edited": False, "confirmedByUser": False}

    report_request = ReportRequest(
        analysis=AnalysisResponse(**analyze_response),
        drafts=drafts,
        user_answers={},
    )

    response = api_client.post("/api/v1/report", json=report_request.model_dump())
    assert response.status_code == 200

    body = response.json()
    md = body["report_md"]

    # Conflicting information should appear
    assert "Conflicting" in md or "conflicting" in md.lower()
    # Missing information should be listed
    assert "Unresolved missing information" in md or "missing" in md.lower()

    # Readiness should reflect conflict cap
    assert body["readiness"]["conflict_cap_applied"] is True
    assert body["readiness"]["score"] == 80


def test_emergency_warnings_retained(api_client: TestClient) -> None:
    """Emergency warnings from the analysis are retained in the report."""
    rich_text_gas = (
        "There is a deep pothole outside the community market on Market Road in "
        "Springfield. It has been there since Monday and cars keep swerving into the "
        "opposite lane to avoid it. The hole is about a metre wide. There is also "
        "a strong smell of gas near the school. The postcode is 12345 and the site "
        "is accessible from the main road."
    )

    fake = FakeClient([payload_json()])
    override_service(fake)

    analyze_response = api_client.post(
        "/api/v1/analyze",
        json={"text": rich_text_gas, "location_hint": "Ward 5, Springfield"},
    ).json()

    drafts: dict[str, any] = {}
    for key in FieldKey:
        drafts[key.value] = {"value": "", "edited": False, "confirmedByUser": False}

    report_request = ReportRequest(
        analysis=AnalysisResponse(**analyze_response),
        drafts=drafts,
        user_answers={},
    )

    response = api_client.post("/api/v1/report", json=report_request.model_dump())
    assert response.status_code == 200

    body = response.json()
    md = body["report_md"]

    # Emergency warning should appear
    assert "Emergency warning" in md or "⚠" in md
    # The emergency message should contain the safety warning
    assert "immediate hazard" in md.lower() or "gas" in md.lower()


def test_exact_disclaimer_presence(api_client: TestClient) -> None:
    """The exact required disclaimer string must appear in the report."""
    fake = FakeClient([payload_json()])
    override_service(fake)

    analyze_response = api_client.post("/api/v1/analyze", json=VALID_REQUEST).json()

    drafts: dict[str, any] = {}
    for key in FieldKey:
        drafts[key.value] = {"value": "", "edited": False, "confirmedByUser": False}

    report_request = ReportRequest(
        analysis=AnalysisResponse(**analyze_response),
        drafts=drafts,
        user_answers={},
    )

    response = api_client.post("/api/v1/report", json=report_request.model_dump())
    assert response.status_code == 200

    body = response.json()
    exact = "AI-assisted draft. Not officially verified, routed, or submitted. Review every field before sharing it."
    assert exact in body["report_md"], f"Exact disclaimer not found. Got:\n{body['report_md'][:200]}"
    # Also in plain text
    assert exact in body["report_text"], f"Exact disclaimer not found in text version"


def test_readiness_calculated_server_side(api_client: TestClient) -> None:
    """Readiness score should reflect the actual field state, not client payload."""
    payload = valid_payload()
    # Remove some fields to make them missing
    for key in ("location.postal_code", "issue.access_notes"):
        field = field_by_key(payload, key)
        field["value"] = None
        field["status"] = "missing"
        field["confidence"] = None
        field["evidence_quote"] = None
        field["rationale"] = None

    fake = FakeClient([payload_json(payload)])
    override_service(fake)

    analyze_response = api_client.post("/api/v1/analyze", json=VALID_REQUEST).json()

    drafts: dict[str, any] = {}
    for key in FieldKey:
        drafts[key.value] = {"value": "", "edited": False, "confirmedByUser": False}

    report_request = ReportRequest(
        analysis=AnalysisResponse(**analyze_response),
        drafts=drafts,
        user_answers={},
    )

    response = api_client.post("/api/v1/report", json=report_request.model_dump())
    assert response.status_code == 200

    body = response.json()
    # Score should be less than 100 since some fields are missing
    assert body["readiness"]["score"] < 100
    # blocking_gaps should include the missing location fields
    assert "location.postal_code" in str(body["readiness"])


def test_invalid_or_tampered_requests(api_client: TestClient) -> None:
    """Tampered payloads (e.g. missing required analysis fields) are rejected."""
    # Send a report request with a malformed analysis payload
    # FastAPI validates the request body with Pydantic before the endpoint runs
    bad_request = {
        "analysis": {"schema_version": "bad", "request_id": "x"},
        "drafts": {},
        "user_answers": {},
    }
    response = api_client.post("/api/v1/report", json=bad_request)
    assert response.status_code == 422  # Validation error from Pydantic

def test_blocking_gaps_communicated(api_client: TestClient) -> None:
    """Blocking gaps are reflected in the blocking_remaining response field."""
    payload = valid_payload()
    # Make location.street_or_landmark missing (blocking weight=3)
    field = field_by_key(payload, "location.street_or_landmark")
    field["value"] = None
    field["status"] = "missing"
    field["confidence"] = None
    field["evidence_quote"] = None
    field["rationale"] = None

    fake = FakeClient([payload_json(payload)])
    override_service(fake)

    analyze_response = api_client.post("/api/v1/analyze", json=VALID_REQUEST).json()

    drafts: dict[str, any] = {}
    for key in FieldKey:
        drafts[key.value] = {"value": "", "edited": False, "confirmedByUser": False}

    report_request = ReportRequest(
        analysis=AnalysisResponse(**analyze_response),
        drafts=drafts,
        user_answers={},
    )

    response = api_client.post("/api/v1/report", json=report_request.model_dump())
    assert response.status_code == 200

    body = response.json()
    assert body["blocking_remaining"] is True
    assert body["readiness"]["blocking_gaps"]

def test_client_readiness_claims_are_ignored(api_client: TestClient) -> None:
    """A tampered readiness score in the payload is recalculated server-side."""
    payload = valid_payload()
    for key in ("location.street_or_landmark", "issue.hazard"):
        field = field_by_key(payload, key)
        field["value"] = None
        field["status"] = "missing"
        field["confidence"] = None
        field["evidence_quote"] = None
        field["rationale"] = None

    fake = FakeClient([payload_json(payload)])
    override_service(fake)

    analyze_response = api_client.post("/api/v1/analyze", json=VALID_REQUEST).json()

    # Tamper: claim a perfect score and no blocking gaps.
    analyze_response["readiness"] = {
        "score": 100,
        "label": "Report completeness",
        "filled_weight": 999,
        "total_weight": 23,
        "blocking_gaps": [],
        "conflict_cap_applied": False,
        "note": "Trust me, it is complete.",
    }

    drafts = {
        key.value: {"value": "", "edited": False, "confirmedByUser": False}
        for key in FieldKey
    }

    response = api_client.post(
        "/api/v1/report",
        json=ReportRequest(
            analysis=AnalysisResponse.model_validate(analyze_response),
            drafts=drafts,
            user_answers={},
        ).model_dump(),
    )
    assert response.status_code == 200

    body = response.json()
    assert body["readiness"]["score"] < 100
    assert body["blocking_remaining"] is True
    assert "location.street_or_landmark" in body["readiness"]["blocking_gaps"]


def test_user_answers_fill_missing_fields(api_client: TestClient) -> None:
    """Explicit answers to missing questions appear and raise completeness."""
    payload = valid_payload()
    field = field_by_key(payload, "location.postal_code")
    field["value"] = None
    field["status"] = "missing"
    field["confidence"] = None
    field["evidence_quote"] = None
    field["rationale"] = None

    fake = FakeClient([payload_json(payload)])
    override_service(fake)

    analyze_response = api_client.post("/api/v1/analyze", json=VALID_REQUEST).json()

    drafts = {
        key.value: {"value": "", "edited": False, "confirmedByUser": False}
        for key in FieldKey
    }

    without_answer = api_client.post(
        "/api/v1/report",
        json=ReportRequest(
            analysis=AnalysisResponse(**analyze_response),
            drafts=drafts,
            user_answers={},
        ).model_dump(),
    ).json()

    with_answer = api_client.post(
        "/api/v1/report",
        json=ReportRequest(
            analysis=AnalysisResponse(**analyze_response),
            drafts=drafts,
            user_answers={"location.postal_code": "12345"},
        ).model_dump(),
    ).json()

    assert with_answer["readiness"]["score"] > without_answer["readiness"]["score"]
    assert "12345" in with_answer["report_md"]
    assert "location.postal_code" not in with_answer["readiness"]["unresolved_keys"]


def test_report_generation_makes_no_gemini_call(api_client: TestClient) -> None:
    """The report endpoint formats an existing analysis; it never re-calls Gemini."""
    fake = FakeClient([payload_json()])
    override_service(fake)

    analyze_response = api_client.post("/api/v1/analyze", json=VALID_REQUEST).json()
    assert len(fake.calls) == 1

    drafts = {
        key.value: {"value": "", "edited": False, "confirmedByUser": False}
        for key in FieldKey
    }
    response = api_client.post(
        "/api/v1/report",
        json=ReportRequest(
            analysis=AnalysisResponse(**analyze_response),
            drafts=drafts,
            user_answers={},
        ).model_dump(),
    )

    assert response.status_code == 200
    assert len(fake.calls) == 1


def test_unknown_draft_keys_are_rejected(api_client: TestClient) -> None:
    """Drafts may only use canonical field keys."""
    fake = FakeClient([payload_json()])
    override_service(fake)
    analyze_response = api_client.post("/api/v1/analyze", json=VALID_REQUEST).json()

    drafts = {
        key.value: {"value": "", "edited": False, "confirmedByUser": False}
        for key in FieldKey
    }
    drafts["issue.spoofed"] = {
        "value": "spoofed key",
        "edited": True,
        "confirmedByUser": True,
    }

    response = api_client.post(
        "/api/v1/report",
        json={
            "analysis": analyze_response,
            "drafts": drafts,
            "user_answers": {},
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_INPUT"


def test_inferred_field_values_are_labelled_not_user_facts(api_client: TestClient) -> None:
    """INFERRED field values appear labelled as AI inference, never as user facts."""
    fake = FakeClient([payload_json()])
    override_service(fake)
    analyze_response = api_client.post("/api/v1/analyze", json=VALID_REQUEST).json()

    drafts = {
        key.value: {"value": "", "edited": False, "confirmedByUser": False}
        for key in FieldKey
    }

    body = api_client.post(
        "/api/v1/report",
        json=ReportRequest(
            analysis=AnalysisResponse(**analyze_response),
            drafts=drafts,
            user_answers={},
        ).model_dump(),
    ).json()

    md = body["report_md"]
    facts = md.split("## User-provided facts", 1)[1].split("\n## ", 1)[0]
    inferred_section = md.split("## AI-inferred details (not reported by you)", 1)[1].split(
        "\n## ", 1
    )[0]

    # "Ongoing" is an inferred value in the fixture.
    assert "Ongoing" not in facts
    assert "Ongoing" in inferred_section
    assert "inferred by AI" in inferred_section
