"""Route contract tests need no running PostgreSQL, Redis, or Gemini services."""
from fastapi.testclient import TestClient

from app.main import app


def test_expected_routes_are_mounted():
    routes = {(route.path, tuple(sorted(getattr(route, "methods", []))))
              for route in app.routes}
    assert ("/api/batches", ("GET",)) in routes
    assert ("/api/batches", ("POST",)) in routes
    assert ("/api/batches/{batch_id}/samples", ("POST",)) in routes
    assert ("/api/samples/{sample_id}/analyze", ("POST",)) in routes
    assert ("/api/samples/{sample_id}/fields/{field_key}", ("PATCH",)) in routes
    assert ("/api/media/{media_id}", ("GET",)) in routes


def test_health_still_works():
    response = TestClient(app).get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "mrg-sample-scanner-api"}
