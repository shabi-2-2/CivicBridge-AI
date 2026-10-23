import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def test_health_returns_phase_1_contract() -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"status", "model", "prompt_version", "demo_mode"}
    assert body["status"] == "ok"
    assert body["demo_mode"] is True
    assert body["model"] is None or isinstance(body["model"], str)
    assert body["prompt_version"] is None or isinstance(body["prompt_version"], str)


def test_health_reports_clean_defaults_without_configuration() -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None,
        gemini_api_key=None,
        gemini_model=None,
        prompt_version=None,
    )

    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["model"] is None
    assert response.json()["prompt_version"] is None


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
