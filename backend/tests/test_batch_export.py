"""SQLite API integration tests for CSV export and batch status without external services."""
import csv
import io

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Batch, Sample, SampleField


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)

    def db_override():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = db_override
    with TestClient(app) as test_client:
        yield test_client, engine
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()


def test_exports_all_completed_records_using_current_reviewed_values(client):
    client_http, engine = client
    with Session(engine) as db:
        batch = Batch(name="test", receiving_date="2026-11-07",
                      default_export_filename="my lab.csv")
        db.add(batch)
        db.flush()
        for index in range(55):
            sample = Sample(batch_id=batch.id, processing_status="completed", label_type="large")
            db.add(sample)
            db.flush()
            db.add(SampleField(
                sample_id=sample.id, field_key="sample_id",
                predicted_value=f"0{index:04d}", current_value=f"0{index:04d}",
                review_required=(index == 0), reviewed=(index != 0),
            ))
            db.add(SampleField(
                sample_id=sample.id, field_key="reference_lube",
                current_value='Oil "Special", WT', review_required=False, reviewed=True,
            ))
        db.add(Sample(batch_id=batch.id, processing_status="failed"))
        db.commit()
        batch_id = batch.id

    result = client_http.get(f"/api/batches/{batch_id}/export.csv")
    assert result.status_code == 200
    assert "my_lab.csv" in result.headers["content-disposition"]
    rows = list(csv.reader(io.StringIO(result.text)))
    assert rows[0] == [
        "Sample ID", "Date Sampled", "Date Received", "Machine",
        "Component", "Serial Number", "Reference Lube",
    ]
    assert len(rows) == 56  # headers + every completed sample beyond the first 50
    assert rows[1][0] == "00000"  # preserve leading zeros
    assert rows[1][2] == "2026-11-07"
    assert rows[1][5] == ""
    assert rows[1][6] == 'Oil "Special", WT'
    reviewed = client_http.get(f"/api/batches/{batch_id}/export.csv?reviewed_only=true")
    assert len(list(csv.reader(io.StringIO(reviewed.text)))) == 55


def test_status_counts_all_samples_and_uses_one_batch_request(client):
    client_http, engine = client
    with Session(engine) as db:
        batch = Batch(name="test", receiving_date="2026-11-07")
        db.add(batch)
        db.flush()
        for status in ("queued", "processing", "completed", "failed"):
            sample = Sample(batch_id=batch.id, processing_status=status)
            db.add(sample)
            db.flush()
            if status == "completed":
                db.add(SampleField(sample_id=sample.id, field_key="sample_id",
                                   review_required=True, reviewed=False))
        db.commit()
        batch_id = batch.id

    result = client_http.get(f"/api/batches/{batch_id}/status")
    assert result.status_code == 200
    assert {key: result.json()[key] for key in (
        "total", "queued", "processing", "completed", "failed", "needs_review"
    )} == {
        "total": 4, "queued": 1, "processing": 1, "completed": 1,
        "failed": 1, "needs_review": 1,
    }
    assert len(result.json()["items"]) == 4
    assert client_http.get("/api/batches/not-found/export.csv").status_code == 404
