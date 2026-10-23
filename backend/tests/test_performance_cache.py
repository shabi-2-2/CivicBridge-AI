"""Tests for performance optimizations, caching, latency instrumentation, and repair behavior."""

import json
from unittest.mock import MagicMock
import pytest

from app.core.errors import (
    GeminiAuthFailed,
    GeminiInvalidOutput,
    GeminiRateLimited,
    GeminiTimeout,
    GeminiUnavailable,
)
from app.schemas.analysis import (
    AnalysisResponse,
    AnalyzeRequest,
    ExtractedField,
    FieldKey,
    FieldStatus,
    GeminiAnalysis,
    IssueCategory,
    IssueExtraction,
    SCHEMA_VERSION,
    SeveritySuggestion,
)
from app.services.analysis import AnalysisService
from app.services.cache import AnalysisCache


def make_valid_gemini_analysis(description: str = "A deep pothole in the road") -> GeminiAnalysis:
    fields = [
        ExtractedField(
            key=FieldKey.ISSUE_DESCRIPTION,
            value=description,
            status=FieldStatus.PROVIDED,
            confidence=0.95,
            evidence_quote=description,
            rationale=None,
        ),
        ExtractedField(
            key=FieldKey.ISSUE_FIRST_OBSERVED,
            value=None,
            status=FieldStatus.MISSING,
            confidence=None,
            evidence_quote=None,
            rationale=None,
        ),
        ExtractedField(
            key=FieldKey.ISSUE_FREQUENCY,
            value=None,
            status=FieldStatus.MISSING,
            confidence=None,
            evidence_quote=None,
            rationale=None,
        ),
        ExtractedField(
            key=FieldKey.ISSUE_SCALE,
            value=None,
            status=FieldStatus.MISSING,
            confidence=None,
            evidence_quote=None,
            rationale=None,
        ),
        ExtractedField(
            key=FieldKey.ISSUE_IMPACT,
            value=None,
            status=FieldStatus.MISSING,
            confidence=None,
            evidence_quote=None,
            rationale=None,
        ),
        ExtractedField(
            key=FieldKey.ISSUE_HAZARD,
            value=None,
            status=FieldStatus.MISSING,
            confidence=None,
            evidence_quote=None,
            rationale=None,
        ),
        ExtractedField(
            key=FieldKey.LOCATION_STREET,
            value="Market Road",
            status=FieldStatus.PROVIDED,
            confidence=0.9,
            evidence_quote="Market Road",
            rationale=None,
        ),
        ExtractedField(
            key=FieldKey.LOCATION_CITY,
            value="Springfield",
            status=FieldStatus.PROVIDED,
            confidence=0.9,
            evidence_quote="Springfield",
            rationale=None,
        ),
        ExtractedField(
            key=FieldKey.LOCATION_POSTAL_CODE,
            value=None,
            status=FieldStatus.MISSING,
            confidence=None,
            evidence_quote=None,
            rationale=None,
        ),
        ExtractedField(
            key=FieldKey.ISSUE_ACCESS_NOTES,
            value=None,
            status=FieldStatus.MISSING,
            confidence=None,
            evidence_quote=None,
            rationale=None,
        ),
    ]
    return GeminiAnalysis(
        schema_version="1.0",
        input_language="en",
        issue=IssueExtraction(
            category=IssueCategory.POTHOLE,
            title="Pothole on Market Road",
            summary="A deep pothole in the road on Market Road in Springfield.",
            severity_suggestion=SeveritySuggestion.HIGH,
            severity_rationale="Hazard to traffic.",
            is_emergency_suspected=False,
            emergency_reason=None,
        ),
        fields=fields,
        inferences=[],
        photo_observations=[],
    )


class MockClient:
    def __init__(self, responses: list[str]) -> None:
        self.responses = list(responses)
        self.calls: list[dict[str, str]] = []

    def generate(self, *, system_instruction: str, user_input: str, schema: dict) -> str:
        self.calls.append({"system_instruction": system_instruction, "user_input": user_input})
        if not self.responses:
            raise RuntimeError("No mock response available")
        return self.responses.pop(0)


# ── Cache Unit Tests ──────────────────────────────────────────────────────────

def test_cache_compute_key_normalizes_whitespace():
    k1 = AnalysisCache.compute_key("  pothole   on road  ", "  market road ", "model-a", "v1")
    k2 = AnalysisCache.compute_key("pothole on road", "market road", "model-a", "v1")
    assert k1 == k2


def test_cache_isolation_across_inputs():
    k1 = AnalysisCache.compute_key("pothole on road", "market road", "model-a", "v1")
    k2 = AnalysisCache.compute_key("pothole on road", "different road", "model-a", "v1")
    k3 = AnalysisCache.compute_key("garbage overflow", "market road", "model-a", "v1")
    k4 = AnalysisCache.compute_key("pothole on road", "market road", "model-b", "v1")
    k5 = AnalysisCache.compute_key("pothole on road", "market road", "model-a", "v2")

    keys = {k1, k2, k3, k4, k5}
    assert len(keys) == 5, "All keys must be mutually isolated"


def test_cache_bounds_eviction():
    cache = AnalysisCache(max_entries=2)
    dummy = make_valid_gemini_analysis()

    client = MockClient([dummy.model_dump_json()])
    service = AnalysisService(client=client, model="test-model", cache=cache)

    # 1st put
    r1 = service.analyze(AnalyzeRequest(text="There is a deep pothole in the road on Market Road in Springfield."), "req-1")
    assert len(cache) == 1

    # 2nd put
    client.responses.append(dummy.model_dump_json())
    r2 = service.analyze(AnalyzeRequest(text="Another deep pothole in the road on Market Road in Springfield."), "req-2")
    assert len(cache) == 2

    # 3rd put: should evict req-1
    client.responses.append(dummy.model_dump_json())
    r3 = service.analyze(AnalyzeRequest(text="A third deep pothole in the road on Market Road in Springfield."), "req-3")
    assert len(cache) == 2

    # Request 1 again should be a cache miss because it was evicted
    client.responses.append(dummy.model_dump_json())
    r1_again = service.analyze(AnalyzeRequest(text="There is a deep pothole in the road on Market Road in Springfield."), "req-1-again")
    assert r1_again.meta.cache_hit is False
    assert len(client.calls) == 4


def test_cache_hit_preserves_data_with_fresh_request_id():
    cache = AnalysisCache(max_entries=10)
    analysis_obj = make_valid_gemini_analysis()
    client = MockClient([analysis_obj.model_dump_json()])
    service = AnalysisService(client=client, model="test-model", cache=cache)

    req = AnalyzeRequest(text="There is a deep pothole in the road on Market Road in Springfield.", location_hint="Market Road")
    
    # 1. Cold call
    res1 = service.analyze(req, "req-first")
    assert res1.request_id == "req-first"
    assert res1.meta.cache_hit is False
    assert res1.meta.duration_ms is not None
    assert res1.meta.model_duration_ms is not None
    assert len(client.calls) == 1

    # 2. Cached call
    res2 = service.analyze(req, "req-second")
    assert res2.request_id == "req-second"
    assert res2.meta.cache_hit is True
    assert res2.meta.model_duration_ms == 0
    assert res2.issue.title == res1.issue.title
    assert len(client.calls) == 1, "Provider must not be called on cache hit"


# ── Repair and Error Tests ───────────────────────────────────────────────────

def test_single_repair_attempt_on_invalid_json():
    valid = make_valid_gemini_analysis()
    # First response invalid, second response valid
    client = MockClient(["{ invalid json }", valid.model_dump_json()])
    service = AnalysisService(client=client, model="test-model", cache=AnalysisCache())

    req = AnalyzeRequest(text="There is a deep pothole in the road on Market Road in Springfield.")
    res = service.analyze(req, "req-repair")

    assert len(client.calls) == 2, "Must perform exactly one repair attempt"
    assert "REPAIR REQUIRED" in client.calls[1]["user_input"]
    assert res.issue.title == valid.issue.title


def test_repair_failure_raises_explicit_invalid_output():
    client = MockClient(["{ invalid 1 }", "{ invalid 2 }"])
    service = AnalysisService(client=client, model="test-model", cache=AnalysisCache())

    req = AnalyzeRequest(text="There is a deep pothole in the road on Market Road in Springfield.")
    with pytest.raises(GeminiInvalidOutput):
        service.analyze(req, "req-repair-fail")

    assert len(client.calls) == 2


def test_provider_failures_not_retried_by_repair():
    class FailingClient:
        def __init__(self, exc: Exception) -> None:
            self.exc = exc
            self.call_count = 0

        def generate(self, *, system_instruction: str, user_input: str, schema: dict) -> str:
            self.call_count += 1
            raise self.exc

    for err_cls in [GeminiTimeout, GeminiRateLimited, GeminiAuthFailed, GeminiUnavailable]:
        client = FailingClient(err_cls())
        cache = AnalysisCache()
        service = AnalysisService(client=client, model="test-model", cache=cache)

        req = AnalyzeRequest(text="There is a deep pothole in the road on Market Road in Springfield.")
        with pytest.raises(err_cls):
            service.analyze(req, "req-error")

        assert client.call_count == 1, "Provider errors must not trigger repair retry"
        assert len(cache) == 0, "Provider failures must not be cached"
