class AppError(Exception):
    """An expected failure that maps to a safe HTTP error response."""

    code = "INTERNAL"
    status_code = 500
    message = "An unexpected error occurred."
    retryable = False

    def __init__(self, message: str | None = None) -> None:
        super().__init__(message or self.message)
        self.message = message or self.message


class GeminiNotConfigured(AppError):
    code = "GEMINI_NOT_CONFIGURED"
    status_code = 503
    message = (
        "Gemini is not configured. Set GEMINI_API_KEY in backend/.env and restart "
        "the backend."
    )
    retryable = False


class GeminiTimeout(AppError):
    code = "GEMINI_TIMEOUT"
    status_code = 504
    message = "Gemini did not respond in time. Please try again."
    retryable = True


class GeminiRateLimited(AppError):
    code = "GEMINI_RATE_LIMITED"
    status_code = 429
    message = "Gemini's rate limit was reached. Wait a moment and try again."
    retryable = True


class GeminiAuthFailed(AppError):
    code = "GEMINI_AUTH_FAILED"
    status_code = 502
    message = "Gemini rejected the API credentials. Check GEMINI_API_KEY."
    retryable = False


class GeminiModelUnavailable(AppError):
    code = "GEMINI_MODEL_UNAVAILABLE"
    status_code = 503
    message = "The configured Gemini model is unavailable. Check GEMINI_MODEL."
    retryable = False


class GeminiUnavailable(AppError):
    code = "GEMINI_UNAVAILABLE"
    status_code = 503
    message = "Gemini is temporarily unavailable. Please try again."
    retryable = True


class GeminiInvalidOutput(AppError):
    code = "GEMINI_INVALID_OUTPUT"
    status_code = 502
    message = (
        "Gemini returned an invalid structured response after one repair attempt. "
        "Please try again."
    )
    retryable = True
