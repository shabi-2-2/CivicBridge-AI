import logging
import time
from uuid import uuid4

from fastapi import APIRouter, Depends, Request

from app.core.config import Settings, get_settings
from app.core.errors import GeminiNotConfigured
from app.schemas.analysis import AnalysisResponse, AnalyzeRequest, ErrorResponse
from app.services.analysis import AnalysisService
from app.services.gemini import DEFAULT_MODEL, GeminiClient
from app.services.prompt import PROMPT_VERSION

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analysis"])


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
