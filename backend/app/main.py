from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description=(
        "CivicBridge AI turns unstructured civic complaints into evidence-labelled "
        "report drafts. Phase 1 exposes health checks only; no analysis pipeline or "
        "submission integration exists yet."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api/v1")


@app.get("/", include_in_schema=False)
def service_index() -> dict[str, str]:
    return {
        "service": "CivicBridge AI API",
        "health": "/api/v1/health",
        "docs": "/docs",
    }
