import logging
import time
from uuid import uuid4

from fastapi import APIRouter, Depends, Request

from app.core.config import Settings, get_settings
from app.core.errors import GeminiNotConfigured
from app.schemas.analysis import AnalysisResponse, AnalyzeRequest, ErrorResponse
from app.services.report import ReportResponse, ReportRequest
from app.services.analysis import AnalysisService
from app.services.cache import AnalysisCache
from app.services.gemini import DEFAULT_MODEL, GeminiClient
from app.services.prompt import PROMPT_VERSION
from app.services.report import generate_report

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analysis"])

_shared_analysis_cache = AnalysisCache()


def get_analysis_service(
    settings: Settings = Depends(get_settings),
) -> AnalysisService:
    if not settings.gemini_api_key:
        raise GeminiNotConfigured()

    model = settings.gemini_model or DEFAULT_MODEL
    prompt_version = settings.prompt_version or PROMPT_VERSION
    client = GeminiClient(
        api_key=settings.gemini_api_key,
        model=model,
        timeout_seconds=settings.gemini_timeout_seconds,
    )
    return AnalysisService(
        client=client,
        model=model,
        prompt_version=prompt_version,
        cache=_shared_analysis_cache,
    )


@router.post(
    "/analyze",
    response_model=AnalysisResponse,
    summary="Analyze a civic complaint",
    description=(
        "Converts an unstructured civic complaint into an evidence-labelled draft. "
        "Gemini output is validated server-side; quotes are checked against the "
        "input, and derived fields are computed deterministically. This endpoint "
        "does not verify, route, or submit a report."
    ),
    responses={
        422: {"model": ErrorResponse, "description": "Invalid request payload."},
        429: {"model": ErrorResponse, "description": "Gemini rate limit reached."},
        502: {
            "model": ErrorResponse,
            "description": "Gemini returned invalid output or rejected credentials.",
        },
        503: {
            "model": ErrorResponse,
            "description": "Gemini is not configured, unavailable, or the model is missing.",
        },
        504: {"model": ErrorResponse, "description": "Gemini timed out."},
    },
)
def analyze(
    payload: AnalyzeRequest,
    request: Request,
    service: AnalysisService = Depends(get_analysis_service),
) -> AnalysisResponse:
    request_id = getattr(request.state, "request_id", uuid4().hex)
    started = time.perf_counter()

    response = service.analyze(payload, request_id)

    logger.info(
        "analyze completed request_id=%s duration_ms=%d",
        request_id,
        int((time.perf_counter() - started) * 1000),
    )
    return response


@router.post(
    "/report",
    response_model=ReportResponse,
    summary="Generate a human-reviewed report",
    description=(
        "Transforms an analyzed civic complaint draft into a deterministic "
        "Markdown and plain-text report. User edits, missing-field answers, "
        "and derived fields are applied server-side. No Gemini call is made "
        "just to format the report."
    ),
    responses={
        400: {"model": ErrorResponse, "description": "Invalid or tampered request payload."},
        422: {"model": ErrorResponse, "description": "Validation failed on server side."},
    },
)
def generate_report_endpoint(
    request: ReportRequest,
    api_request: Request,
) -> ReportResponse:
    """Generate a human-reviewed report from an analyzed draft."""
    report_id = getattr(api_request.state, "request_id", uuid4().hex)
    try:
        result = generate_report(request)
        logger.info(
            "report generated request_id=%s report_request_id=%s blocking=%s",
            report_id,
            result.request_id,
            result.blocking_remaining,
        )
        return result
    except ValueError as exc:
        from fastapi.responses import JSONResponse
        from app.schemas.analysis import ErrorDetail, ErrorResponse, ValidationIssue

        request_id = getattr(api_request.state, "request_id", "")
        details: list[ValidationIssue] = [
            ValidationIssue(field="payload", message=str(exc))
        ]
        error = ErrorDetail(
            code="INVALID_INPUT",
            message=str(exc),
            request_id=request_id,
            retryable=False,
            details=details,
        )
        return JSONResponse(status_code=400, content=ErrorResponse(error=error).model_dump(mode="json"))
    except Exception as exc:  # pragma: no cover - defensive
        request_id = getattr(api_request.state, "request_id", "")
        logger.error(
            "report generation failed request_id=%s error=%s",
            request_id,
            type(exc).__name__,
        )
        raise exc

