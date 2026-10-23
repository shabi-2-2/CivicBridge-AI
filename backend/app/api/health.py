from fastapi import APIRouter

from app.core.config import get_settings
from app.schemas.health import HealthResponse

router = APIRouter(tags=["system"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service health",
    description="Reports liveness and Phase 1 AI metadata. Requires no Gemini API key.",
)
def get_health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        model=settings.gemini_model,
        prompt_version=settings.prompt_version,
        demo_mode=settings.demo_mode,
    )
