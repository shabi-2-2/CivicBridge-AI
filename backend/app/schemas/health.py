from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Phase 1 health contract. No API key or external service is required."""

    status: Literal["ok"] = Field(default="ok", description="Service liveness.")
    model: str | None = Field(default=None, description="Gemini model in use, if any.")
    prompt_version: str | None = Field(default=None, description="Active prompt version, if any.")
    demo_mode: bool = Field(default=True, description="Whether demo fixtures are enabled.")
