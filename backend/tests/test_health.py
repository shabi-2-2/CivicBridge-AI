from fastapi.testclient import TestClient
from pydantic import ValidationError
import pytest

from app.core.config import Settings
from app.main import app

client = TestClient(app)


def test_health_returns_phase_1_contract() -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "model": None,
        "prompt_version": None,
        "demo_mode": True,
    }


def test_health_allows_configured_frontend_origin() -> None:
    response = client.get(
        "/api/v1/health",
        headers={"Origin": "http://localhost:5173"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_health_does_not_allow_unknown_origin() -> None:
    response = client.get(
        "/api/v1/health",
        headers={"Origin": "https://example.com"},
    )

    assert "access-control-allow-origin" not in response.headers


def test_cors_wildcard_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Settings(cors_origins="*")
