"""Batch-year warnings and sample verification are advisory and reversible."""
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
    engine = create_engine("sqlite+pysqlite:///:memory:",
                           connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)

    def override():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = override
    with TestClient(app) as http:
        yield http, engine
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()


def test_year_outlier_unreadable_fields_and_verification(client):
    http, engine = client
    with Session(engine) as db:
        batch = Batch(name="November intake", receiving_date="2026-11-07")
        db.add(batch)
        db.flush()
        samples = []
        for yr in ("2026", "2026", "2026", "2016", None):
            sample = Sample(batch_id=batch.id, processing_status="completed", label_type="small")
            db.add(sample)
            db.flush()
            db.add(SampleField(
                sample_id=sample.id, field_key="date_sampled",
                current_value=f"{yr}-10-05" if yr else None,
                status="unreadable" if yr is None else "extracted",
            ))
            samples.append(sample.id)
        db.commit()
        batch_id = batch.id

    response = http.get(f"/api/batches/{batch_id}/quality")
    assert response.status_code == 200
    report = response.json()
    assert report["consensus_year"] == 2026
    assert report["scanned"] == 5
    assert any(a["code"] == "year_outlier" and a["field_key"] == "date_sampled"
               for a in report["flags"][samples[3]])
    assert any(a["code"] == "unreadable" and a["field_key"] == "date_sampled"
               for a in report["flags"][samples[4]])

    filtered = http.get(f"/api/batches/{batch_id}/inventory?flagged_only=true")
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 2  # blank does not mean unreadable

    assert http.post(f"/api/samples/{samples[3]}/verify").status_code == 200
    detail = http.get(f"/api/samples/{samples[3]}").json()
    assert detail["review_status"] == "verified"
    filtered = http.get(f"/api/batches/{batch_id}/inventory?flagged_only=true")
    assert filtered.json()["total"] == 1
    assert http.post(f"/api/samples/{samples[3]}/reopen").json()["review_status"] == "pending"

    # Editing after verification revokes sample-level verification.
    assert http.post(f"/api/samples/{samples[3]}/verify").status_code == 200
    edited = http.patch(f"/api/samples/{samples[3]}/fields/date_sampled",
                        json={"current_value": "2026-10-05"})
    assert edited.status_code == 200
    assert edited.json()["review_status"] == "pending"


def test_no_consensus_from_tiny_or_disagreeing_batch(client):
    http, engine = client
    with Session(engine) as db:
        batch = Batch(name="Small", receiving_date="2026-11-07")
        db.add(batch)
        db.flush()
        for year in ("2016", "2026"):
            sample = Sample(batch_id=batch.id, processing_status="completed", label_type="large")
            db.add(sample)
            db.flush()
            db.add(SampleField(sample_id=sample.id, field_key="date_sampled",
                               current_value=f"{year}-11-01", status="extracted"))
        db.commit()
        batch_id = batch.id
    report = http.get(f"/api/batches/{batch_id}/quality").json()
    assert report["consensus_year"] is None
    assert not any(flag["code"] == "year_outlier"
                   for flags in report["flags"].values() for flag in flags)


def test_blank_serial_number_is_not_confused_with_unreadable(client):
    http, engine = client
    with Session(engine) as db:
        batch = Batch(name="Small labels", receiving_date="2026-11-07")
        db.add(batch)
        db.flush()
        blank = Sample(batch_id=batch.id, label_type="small",
                       processing_status="completed")
        unreadable = Sample(batch_id=batch.id, label_type="small",
                            processing_status="completed")
        db.add_all([blank, unreadable])
        db.flush()
        db.add(SampleField(sample_id=blank.id, field_key="serial_number",
                           status="missing", current_value=None))
        db.add(SampleField(sample_id=unreadable.id, field_key="serial_number",
                           status="unreadable", current_value=None))
        db.commit()
        bid, blank_id, unreadable_id = batch.id, blank.id, unreadable.id

    report = http.get(f"/api/batches/{bid}/quality").json()
    assert blank_id not in report["flags"]
    assert any(flag["code"] == "unreadable" and flag["field_key"] == "serial_number"
               for flag in report["flags"][unreadable_id])



def test_low_ocr_score_is_flagged_but_blank_optional_serial_is_not(client):
    http, engine = client
    with Session(engine) as db:
        batch = Batch(name="OCR quality", receiving_date="2026-11-07")
        db.add(batch)
        db.flush()
        sample = Sample(batch_id=batch.id, label_type="small", processing_status="completed")
        db.add(sample)
        db.flush()
        db.add_all([
            SampleField(sample_id=sample.id, field_key="serial_number",
                        current_value=None, status="missing"),
            SampleField(sample_id=sample.id, field_key="machine",
                        current_value="UP 5258", status="extracted",
                        confidence=0.67, confidence_source="paddleocr_cpu"),
            SampleField(sample_id=sample.id, field_key="date_sampled",
                        current_value="2026-11-08", status="extracted",
                        confidence=0.97, confidence_source="paddleocr_cpu"),
        ])
        db.commit()
        bid, sid = batch.id, sample.id
    flags = http.get(f"/api/batches/{bid}/quality").json()["flags"][sid]
    assert any(f["code"] == "low_ocr_score" and f["field_key"] == "machine"
               for f in flags)
    assert not any(f["field_key"] == "serial_number" for f in flags)
