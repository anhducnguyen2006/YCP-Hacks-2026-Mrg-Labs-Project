"""Inventory filtering, model confidence, and guarded sample removal."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Batch, ProcessingJob, Sample, SampleField

@pytest.fixture
def setup():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    def db_override():
        with Session(engine) as db:
            yield db
    app.dependency_overrides[get_db] = db_override
    with TestClient(app) as http:
        yield http, engine
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()

def test_search_sort_and_confidence_survive_api_serialization(setup):
    http, engine = setup
    with Session(engine) as db:
        batch = Batch(name="B", receiving_date="2026-11-07")
        db.add(batch)
        db.flush()
        for idx, (sid, confidence, machine) in enumerate([
            ("00123", "low", "TURBINE"),
            ("00009", "high", "Pump"),
            ("00177", None, "press"),
        ]):
            sample = Sample(batch_id=batch.id, processing_status="completed",
                            ai_confidence=confidence, ai_confidence_reason="Blurry handwriting" if confidence else None)
            db.add(sample)
            db.flush()
            db.add(SampleField(sample_id=sample.id, field_key="sample_id",
                               current_value=sid, review_required=False, reviewed=True))
            db.add(SampleField(sample_id=sample.id, field_key="machine",
                               current_value=machine, review_required=False, reviewed=True))
        db.commit()
        bid = batch.id

    all_items = http.get(f"/api/batches/{bid}/inventory", params={
        "sort_by": "confidence", "descending": "false"
    })
    assert all_items.status_code == 200
    assert all_items.json()["total"] == 3
    assert [r["ai_confidence"] for r in all_items.json()["items"]] == [None, "low", "high"]
    assert all_items.json()["items"][1]["ai_confidence_reason"] == "Blurry handwriting"
    low_only = http.get(f"/api/batches/{bid}/inventory", params={"confidence": "low"})
    assert low_only.json()["total"] == 1
    assert low_only.json()["items"][0]["ai_confidence"] == "low"
    found = http.get(f"/api/batches/{bid}/inventory", params={"search": "turb"})
    assert found.json()["total"] == 1
    assert found.json()["items"][0]["external_sample_id"] is None
    assert found.json()["items"][0]["fields"][0]["current_value"] in {"00123", "TURBINE"}
    page = http.get(f"/api/batches/{bid}/inventory", params={
        "sort_by": "sample_id", "descending": "false", "offset": 1, "limit": 1,
    })
    assert page.json()["total"] == 3
    assert len(page.json()["items"]) == 1

def test_bulk_delete_rejects_running_jobs_and_checks_batch_membership(setup, tmp_path, monkeypatch):
    http, engine = setup
    from app import main
    monkeypatch.setattr(main.settings, "media_root", str(tmp_path))
    with Session(engine) as db:
        batch = Batch(name="B", receiving_date="2026-11-07")
        other = Batch(name="Other", receiving_date="2026-11-07")
        db.add_all([batch, other])
        db.flush()
        completed = Sample(batch_id=batch.id, processing_status="completed")
        active = Sample(batch_id=batch.id, processing_status="processing")
        foreign = Sample(batch_id=other.id, processing_status="completed")
        db.add_all([completed, active, foreign])
        db.flush()
        db.add(ProcessingJob(sample_id=active.id, status="processing"))
        db.add(SampleField(sample_id=completed.id, field_key="sample_id",
                           current_value="00001", reviewed=True))
        db.commit()
        bid, completed_id, active_id, foreign_id = (
            batch.id, completed.id, active.id, foreign.id
        )
    media_dir = tmp_path / completed_id
    media_dir.mkdir()
    (media_dir / "original.mov").write_bytes(b"video")
    route = f"/api/batches/{bid}/samples/delete"
    assert http.post(route, json={"sample_ids": [active_id]}).status_code == 409
    assert http.post(route, json={"sample_ids": [foreign_id]}).status_code == 404
    ok = http.post(route, json={"sample_ids": [completed_id]})
    assert ok.status_code == 200
    assert ok.json() == {"deleted": 1}
    assert not media_dir.exists()
    with Session(engine) as db:
        assert db.get(Sample, completed_id) is None
        assert db.get(Sample, active_id) is not None
        assert db.get(Sample, foreign_id) is not None
