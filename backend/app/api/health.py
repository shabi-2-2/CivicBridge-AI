from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.schemas.health import HealthResponse

router = APIRouter(tags=["system"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service health",
    description="Reports liveness and configured AI metadata. Requires no Gemini API key.",
)
def get_health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(
        status="ok",
        model=settings.gemini_model,
        prompt_version=settings.prompt_version,
        demo_mode=settings.demo_mode,
    )
