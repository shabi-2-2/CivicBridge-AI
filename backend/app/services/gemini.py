import logging
from typing import Any, NoReturn, Protocol

from app.core.errors import (
    GeminiAuthFailed,
    GeminiModelUnavailable,
    GeminiNotConfigured,
    GeminiRateLimited,
    GeminiTimeout,
    GeminiUnavailable,
)

logger = logging.getLogger(__name__)

# Configurable through GEMINI_MODEL. This is the model verified against the
# currently supported Interactions API in this repository.
DEFAULT_MODEL = "gemini-3.6-flash"


class StructuredModelClient(Protocol):
    """Minimal provider boundary so tests never call Gemini."""

    def generate(
        self,
        *,
        system_instruction: str,
        user_input: str,
        schema: dict[str, Any],
    ) -> str: ...


class GeminiClient:
    """Thin wrapper around the official google-genai SDK (Interactions API)."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str = DEFAULT_MODEL,
        timeout_seconds: float = 15.0,
    ) -> None:
        if not api_key or not api_key.strip():
            raise GeminiNotConfigured()

        try:
            from google import genai
        except ImportError as exc:  # pragma: no cover - dependency is installed
            raise GeminiNotConfigured(
                "The google-genai SDK is not installed. Run "
                "`pip install -r backend/requirements.txt` and restart the backend."
            ) from exc

        self._model = model
        self._timeout_seconds = timeout_seconds
        self._client = genai.Client(api_key=api_key.strip())

    @property
    def model(self) -> str:
        return self._model

    def generate(
        self,
        *,
        system_instruction: str,
        user_input: str,
        schema: dict[str, Any],
    ) -> str:
        try:
            interaction = self._client.interactions.create(
                model=self._model,
                system_instruction=system_instruction,
                input=user_input,
                response_format={
                    "type": "text",
                    "mime_type": "application/json",
                    "schema": schema,
                },
                generation_config={
                    "temperature": 0.2,
                    "max_output_tokens": 2600,
                    "thinking_level": "low",
                },
                timeout=self._timeout_seconds,
            )
        except Exception as exc:  # mapped below; never logged with raw details
            _raise_safe_provider_error(exc)

        output = getattr(interaction, "output_text", None)
        if not isinstance(output, str) or not output.strip():
            # Empty output is treated as invalid structured output so the
            # orchestrator can perform its single repair attempt.
            logger.warning("gemini returned no text; requesting repair")
            return ""
        return output


def _raise_safe_provider_error(exc: BaseException) -> NoReturn:
    """Translate SDK/transport failures without leaking provider payloads."""

    import httpx

    if isinstance(exc, (TimeoutError, httpx.TimeoutException)) or "timeout" in type(
        exc
    ).__name__.lower():
        logger.warning("gemini request timed out type=%s", type(exc).__name__)
        raise GeminiTimeout() from None

    try:
        from google.genai import errors as genai_errors
    except ImportError:  # pragma: no cover
        genai_errors = None  # type: ignore[assignment]

    if genai_errors is not None and isinstance(exc, genai_errors.APIError):
        code = int(getattr(exc, "code", 0) or 0)
        status = str(getattr(exc, "status", "") or "").upper()
        message = str(getattr(exc, "message", "") or "").lower()

        if code == 429 or status == "RESOURCE_EXHAUSTED":
            logger.warning("gemini rate limited code=%s status=%s", code, status)
            raise GeminiRateLimited() from None

        if code == 504 or status == "DEADLINE_EXCEEDED":
            logger.warning("gemini deadline exceeded code=%s status=%s", code, status)
            raise GeminiTimeout() from None

        if (
            code in {401, 403}
            or status in {"UNAUTHENTICATED", "PERMISSION_DENIED"}
            or (code == 400 and "api key" in message)
        ):
            logger.warning("gemini authentication failed code=%s status=%s", code, status)
            raise GeminiAuthFailed() from None

        if code == 404 or status == "NOT_FOUND":
            logger.warning("gemini model unavailable code=%s status=%s", code, status)
            raise GeminiModelUnavailable() from None

        logger.warning("gemini provider error code=%s status=%s", code, status)
        raise GeminiUnavailable() from None

    if isinstance(exc, httpx.TransportError):
        logger.warning("gemini transport error type=%s", type(exc).__name__)
        raise GeminiUnavailable() from None

    logger.warning("gemini provider failure type=%s", type(exc).__name__)
    raise GeminiUnavailable() from None


__all__ = [
    "DEFAULT_MODEL",
    "GeminiClient",
    "StructuredModelClient",
]
