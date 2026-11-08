"""Selective CSV exports and queued-job cancellation; no Gemini or Redis needed."""
import csv
import io

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Batch, ProcessingJob, Sample, SampleField


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


def test_export_preview_and_selected_records(local_api):
    http, engine = local_api
    with Session(engine) as db:
        batch = Batch(name="Batch", receiving_date="2026-11-07")
        other = Batch(name="Other", receiving_date="2026-11-07")
        db.add_all([batch, other])
        db.flush()
        samples = [
            Sample(batch_id=batch.id, processing_status="completed", review_status="verified"),
            Sample(batch_id=batch.id, processing_status="completed", review_status="pending"),
            Sample(batch_id=batch.id, processing_status="queued"),
            Sample(batch_id=other.id, processing_status="completed"),
        ]
        db.add_all(samples)
        db.flush()
        for index, row in enumerate(samples):
            db.add(SampleField(
                sample_id=row.id, field_key="sample_id",
                current_value=f"000{index}", status="extracted",
            ))
        db.commit()
        bid, other_id = batch.id, samples[3].id
        verified_id, pending_id, queued_id = (s.id for s in samples[:3])

    preview = http.get(f"/api/batches/{bid}/export-preview")
    assert preview.status_code == 200
    items = preview.json()
    assert len(items) == 2
    assert {row["label"] for row in items} == {"0000", "0001"}
    assert sum(row["verified"] for row in items) == 1

    route = f"/api/batches/{bid}/export-selected.csv"
    result = http.post(route, json={
        "sample_ids": [pending_id, verified_id],
        "verified_only": False,
    })
    assert result.status_code == 200
    rows = list(csv.reader(io.StringIO(result.text)))
    assert len(rows) == 3
    assert len(rows[0]) == 7
    assert [row[0] for row in rows[1:]] == ["0001", "0000"]
    assert [row[2] for row in rows[1:]] == ["2026-11-07", "2026-11-07"]
    assert http.post(route, json={
        "sample_ids": [pending_id], "verified_only": True,
    }).status_code == 422
    assert http.post(route, json={
        "sample_ids": [queued_id],
    }).status_code == 422
    assert http.post(route, json={
        "sample_ids": [other_id],
    }).status_code == 422
    assert http.post(route, json={
        "sample_ids": [verified_id], "verified_only": True,
    }).status_code == 200


def test_cancel_only_queued_rq_jobs(local_api, monkeypatch):
    from app import main

    http, engine = local_api
    with Session(engine) as db:
        batch = Batch(name="Queue", receiving_date="2026-11-07")
        db.add(batch)
        db.flush()
        queued = Sample(batch_id=batch.id, processing_status="queued")
        processing = Sample(batch_id=batch.id, processing_status="processing")
        db.add_all([queued, processing])
        db.flush()
        db.add_all([
            ProcessingJob(sample_id=queued.id, status="queued"),
            ProcessingJob(sample_id=processing.id, status="processing"),
        ])
        db.commit()
        bid, queued_id, processing_id = batch.id, queued.id, processing.id

    seen = []

    class FakeRQJob:
        def get_status(self, refresh=False):
            return "queued"

        def cancel(self):
            seen.append("cancel")

    monkeypatch.setattr(main.Redis, "from_url", lambda *_: object())
    monkeypatch.setattr(main.Job, "fetch", lambda *_args, **_kwargs: FakeRQJob())
    response = http.post(f"/api/batches/{bid}/cancel-queued")
    assert response.status_code == 200
    assert response.json() == {"canceled": 1}
    assert seen == ["cancel"]
    with Session(engine) as db:
        assert db.get(Sample, queued_id).processing_status == "canceled"
        assert db.get(Sample, processing_id).processing_status == "processing"
    assert http.get(f"/api/batches/{bid}/status").json()["canceled"] == 1
