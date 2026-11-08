"""Integration contract: mock only the expensive PaddleOCR inference boundary."""
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import jobs
from app.db import Base
from app.models import Batch, ProcessingJob, Sample, SampleField, SampleMedia


@pytest.fixture
def fixture_data(tmp_path, monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        batch = Batch(name="OCR intake", receiving_date="2026-11-07")
        db.add(batch)
        db.flush()
        sample = Sample(batch_id=batch.id, processing_status="queued")
        db.add(sample)
        db.flush()
        job = ProcessingJob(sample_id=sample.id, status="queued")
        db.add(job)
        db.flush()
        db.add(SampleMedia(
            sample_id=sample.id, media_type="video",
            relative_path=f"{sample.id}/source.mp4", mime_type="video/mp4",
            metadata_json={},
        ))
        db.commit()
        sid, jid = sample.id, job.id
    video = tmp_path / sid / "source.mp4"
    video.parent.mkdir(parents=True)
    video.write_bytes(b"mock input only")
    monkeypatch.setattr(jobs, "SessionLocal", lambda: Session(engine))
    monkeypatch.setattr(jobs, "get_settings", lambda: SimpleNamespace(media_root=str(tmp_path)))
    yield engine, sid, jid
    engine.dispose()


def test_worker_persists_confidence_iso_date_and_eight_original_frames(fixture_data, monkeypatch):
    engine, sid, jid = fixture_data

    def fake_ocr(video, output_dir):
        assert Path(video).exists()
        folder = Path(output_dir)
        for n in range(8):
            (folder / f"frame_{n}_id{n * 7}.jpg").write_bytes(b"jpeg")
            (folder / f"frame_{n}_id{n * 7}_annotated.jpg").write_bytes(b"overlay")
        return {"tube_type": "Small", "table_row": {
            "Sample ID": {"value": "00123456", "confidence": .98},
            "Date Sampled": {"value": "110826", "confidence": .97},
            "Machine": {"value": "UP 5258", "confidence": .97},
            "Component": {"value": "5 GS", "confidence": .96},
            "Serial Number": {"value": "N/A", "confidence": 0.0},
            "Reference Lube": {"value": "[Leave Blank]", "confidence": 1.0},
        }}

    monkeypatch.setattr(jobs, "process_tube_video", fake_ocr)
    jobs.process_sample(sid, jid)

    with Session(engine) as db:
        sample = db.get(Sample, sid)
        assert sample.processing_status == "completed"
        assert sample.ai_confidence == "high"
        assert sample.external_sample_id == "00123456"
        fields = {
            field.field_key: field
            for field in db.scalars(select(SampleField).where(SampleField.sample_id == sid))
        }
        assert len(fields) == 7
        assert fields["date_sampled"].current_value == "2026-11-08"
        assert fields["date_received"].current_value == "2026-11-07"
        assert fields["date_received"].confidence is None
        assert fields["serial_number"].current_value is None
        assert not fields["serial_number"].review_required
        assert fields["reference_lube"].status == "not_applicable"
        assert fields["component"].confidence_source == "derived_heuristic"
        assert fields["sample_id"].confidence == .98
        media = list(db.scalars(select(SampleMedia).where(
            SampleMedia.sample_id == sid, SampleMedia.media_type == "keyframe"
        )))
        assert len(media) == 8
        assert sorted(m.metadata_json["frame_rank"] for m in media) == list(range(8))
        assert all(jid in m.relative_path for m in media)


def test_cancelled_job_never_restarts(fixture_data, monkeypatch):
    engine, sid, jid = fixture_data
    with Session(engine) as db:
        db.get(ProcessingJob, jid).status = "canceled"
        db.get(Sample, sid).processing_status = "canceled"
        db.commit()

    def should_not_run(*args, **kwargs):
        pytest.fail("OCR should not run on a canceled job")

    monkeypatch.setattr(jobs, "process_tube_video", should_not_run)
    jobs.process_sample(sid, jid)
    with Session(engine) as db:
        assert db.get(Sample, sid).processing_status == "canceled"


def test_invalid_dates_require_review(fixture_data, monkeypatch):
    engine, sid, jid = fixture_data
    monkeypatch.setattr(jobs, "process_tube_video", lambda _video, output_dir: {
        "tube_type": "Small", "table_row": {
            "Sample ID": {"value": "00123456", "confidence": .99},
            "Date Sampled": {"value": "11/08", "confidence": .95},
            "Machine": {"value": "UP 5258", "confidence": .99},
            "Component": {"value": "5 GS", "confidence": .99},
            "Serial Number": {"value": "N/A", "confidence": 0.0},
            "Reference Lube": {"value": "[Leave Blank]", "confidence": 1.0},
        },
    })
    jobs.process_sample(sid, jid)
    with Session(engine) as db:
        field = db.scalars(select(SampleField).where(
            SampleField.sample_id == sid,
            SampleField.field_key == "date_sampled",
        )).one()
        assert field.current_value == "11/08"
        assert field.status == "invalid_date"
        assert field.review_required
        assert db.get(Sample, sid).ai_confidence == "low"
