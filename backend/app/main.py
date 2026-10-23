import logging
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.analysis import router as analysis_router
from app.api.health import router as health_router
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.middleware import RequestIdMiddleware
from app.schemas.analysis import (
    ErrorDetail,
    ErrorResponse,
    ValidationIssue,
)

logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.2.0",
    description=(
        "CivicBridge AI turns unstructured civic complaints into evidence-labelled "
        "report drafts. Gemini output is schema-validated and quotes are checked "
        "against the submitted input. The service does not verify, route, or submit "
        "reports."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
app.add_middleware(RequestIdMiddleware)

app.include_router(health_router, prefix="/api/v1")
app.include_router(analysis_router, prefix="/api/v1")


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "") or uuid4().hex


def _error_response(
    *,
    status_code: int,
    code: str,
    message: str,
    request_id: str,
    retryable: bool,
    details: list[ValidationIssue] | None = None,
) -> JSONResponse:
    body = ErrorResponse(
        error=ErrorDetail(
            code=code,
            message=message,
            request_id=request_id,
            retryable=retryable,
            details=details,
        )
    )
    return JSONResponse(status_code=status_code, content=body.model_dump(mode="json"))


@app.exception_handler(AppError)
async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
    request_id = _request_id(request)
    logger.warning(
        "request failed request_id=%s code=%s status=%s",
        request_id,
        exc.code,
        exc.status_code,
    )
    return _error_response(
        status_code=exc.status_code,
        code=exc.code,
        message=exc.message,
        request_id=request_id,
        retryable=exc.retryable,
    )


@app.exception_handler(RequestValidationError)
async def handle_request_validation(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    request_id = _request_id(request)
    details: list[ValidationIssue] = []
    for error in exc.errors()[:10]:
        location = [
            str(part)
            for part in error.get("loc", ())
            if part not in {"body", "query", "path"}
        ]
        details.append(
            ValidationIssue(
                field=".".join(location) or "request",
                message=str(error.get("msg", "Invalid value.")),
            )
        )

    logger.info("request validation failed request_id=%s", request_id)
    return _error_response(
        status_code=422,
        code="INVALID_INPUT",
        message=(
            "Request validation failed. text must be 20-2000 characters and "
            "location_hint at most 200 characters. Unexpected properties are "
            "rejected."
        ),
        request_id=request_id,
        retryable=False,
        details=details,
    )


@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    request_id = _request_id(request)
    logger.error(
        "unhandled error request_id=%s type=%s",
        request_id,
        type(exc).__name__,
    )
    return _error_response(
        status_code=500,
        code="INTERNAL",
        message="An unexpected error occurred. Please try again.",
        request_id=request_id,
        retryable=False,
    )


@app.get("/", include_in_schema=False)
def service_index() -> dict[str, str]:
    return {
        "service": "CivicBridge AI API",
        "health": "/api/v1/health",
        "analyze": "/api/v1/analyze",
        "docs": "/docs",
    }
