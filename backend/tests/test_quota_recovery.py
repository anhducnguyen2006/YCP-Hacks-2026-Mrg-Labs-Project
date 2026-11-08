"""Quota holds are advisory, recoverable, and never discard uploaded media."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import main
from app.db import Base, get_db
from app.main import app
from app.models import Batch, ProcessingJob, Sample


@pytest.fixture
def local_api():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)

    def override():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = override
    with TestClient(app) as http:
        yield http, engine
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()


def test_quota_gate_roundtrip():
    from app.quota_gate import GATE_KEY, clear_hold, get_hold, set_hold

    class RedisMemory:
        def __init__(self):
            self.value = None
            self.ttl_seconds = 0

        def get(self, key):
            assert key == GATE_KEY
            return self.value

        def set(self, key, value, ex):
            assert key == GATE_KEY
            self.value = value.encode()
            self.ttl_seconds = ex

        def ttl(self, key):
            assert key == GATE_KEY
            return self.ttl_seconds

        def delete(self, key):
            assert key == GATE_KEY
            self.value = None

    redis = RedisMemory()
    assert get_hold(redis) is None
    set_hold(redis, "quota")
    assert get_hold(redis) == {"reason": "quota", "seconds_remaining": 3600}
    clear_hold(redis)
    assert get_hold(redis) is None
    set_hold(redis, "unavailable")
    assert get_hold(redis)["seconds_remaining"] == 120


def test_resume_endpoint_requeues_paused_without_reupload(local_api, monkeypatch):
    http, engine = local_api
    with Session(engine) as db:
        batch = Batch(name="Batch", receiving_date="2026-11-07")
        db.add(batch)
        db.flush()
        paused = Sample(batch_id=batch.id, processing_status="paused")
        db.add(paused)
        db.flush()
        db.add(ProcessingJob(sample_id=paused.id, status="paused"))
        db.commit()
        bid, sid = batch.id, paused.id

    cleared = []
    resumed = []
    monkeypatch.setattr(main, "connection", lambda: object())
    monkeypatch.setattr(main, "clear_hold", lambda _redis: cleared.append(True))

    def fake_analyze(sample_id, db):
        resumed.append(sample_id)
        sample = db.get(Sample, sample_id)
        sample.processing_status = "queued"
        db.commit()

    monkeypatch.setattr(main, "analyze_sample", fake_analyze)
    response = http.post(f"/api/batches/{bid}/resume-paused")
    assert response.status_code == 200
    assert response.json() == {"resumed": 1, "failed": 0}
    assert cleared == [True] and resumed == [sid]
    assert http.get(f"/api/batches/{bid}/status").json()["paused"] == 0
