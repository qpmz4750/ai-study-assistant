"""Smoke tests for application startup and health."""

from fastapi.testclient import TestClient

from main import app


def test_health_endpoint() -> None:
    response = TestClient(app).get("/")

    assert response.status_code == 200
    assert response.json() == {"message": "AI Study Assistant is running"}

