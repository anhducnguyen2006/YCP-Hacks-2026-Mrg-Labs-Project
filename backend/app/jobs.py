"""Long-lived RQ task: decode -> choose frames -> one Gemini request -> persist."""
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.frame_selection import select_frames
from app.gemini_frames import GeminiRateLimitError, GeminiUnavailableError, analyze_selected_frames
from app.models import Batch, ProcessingJob, Sample, SampleField, SampleMedia
from app.quota_gate import connection, get_hold, set_hold
from app.schemas import FIELD_KEYS


def _time() -> datetime:
    return datetime.now(UTC)


def _stage(job_id: str, sample_id: str, name: str) -> bool:
    with SessionLocal() as db:
        job = db.get(ProcessingJob, job_id)
        sample = db.get(Sample, sample_id)
        if not job or not sample:
            raise ValueError("Processing job or sample no longer exists.")
        if job.status == "canceled":
            return False
        job.status = "processing"
        job.current_stage = name
        sample.processing_status = "processing"
        sample.updated_at = _time()
        db.commit()
        return True


def _pause(job_id: str, sample_id: str, reason: str) -> None:
    """Persist recoverable state; no new media upload or new Gemini call required."""
    with SessionLocal() as db:
        job = db.get(ProcessingJob, job_id)
        sample = db.get(Sample, sample_id)
        if not job or not sample or job.status == "canceled":
            return
        job.status = "paused"
        job.current_stage = "awaiting_capacity"
        job.error_message = (
            "Gemini quota/rate limit (HTTP 429). Resume manually after quota recovers."
            if reason == "quota" else
            "Gemini overloaded (HTTP 503). Resume manually after service recovers."
        )
        sample.processing_status = "paused"
        sample.updated_at = _time()
        db.commit()


def process_sample(sample_id: str, job_id: str) -> None:
    settings = get_settings()
    root = Path(settings.media_root).resolve()
    try:
        hold = get_hold(connection())
        if hold:
            _pause(job_id, sample_id, str(hold["reason"]))
            return
        if not _stage(job_id, sample_id, "extracting_frames"):
            return
        with SessionLocal() as db:
            video = db.scalars(
                select(SampleMedia).where(
                    SampleMedia.sample_id == sample_id, SampleMedia.media_type == "video"
                )
            ).first()
            if not video:
                raise ValueError("Uploaded source video not found.")
            video_path = (root / video.relative_path).resolve()
            if not video_path.is_relative_to(root):
                raise ValueError("Invalid stored video path.")
        frames = select_frames(video_path, count=settings.selected_frame_count)
        with SessionLocal() as db:
            # On retry replace existing keyframes instead of generating duplicates.
            old_frames = db.scalars(
                select(SampleMedia).where(
                    SampleMedia.sample_id == sample_id, SampleMedia.media_type == "keyframe"
                )
            ).all()
            for old in old_frames:
                db.delete(old)
            for index, frame in enumerate(frames):
                relative = Path(sample_id) / f"frame_{index:02d}.jpg"
                output_path = root / relative
                output_path.parent.mkdir(parents=True, exist_ok=True)
                output_path.write_bytes(frame.jpeg)
                db.add(SampleMedia(
                    sample_id=sample_id, media_type="keyframe", mime_type="image/jpeg",
                    relative_path=str(relative),
                    metadata_json={
                        "timestamp_seconds": round(frame.timestamp_seconds, 3),
                        "sharpness": round(frame.sharpness, 2),
                    },
                ))
            db.commit()
        hold = get_hold(connection())
        if hold:
            _pause(job_id, sample_id, str(hold["reason"]))
            return
        _stage(job_id, sample_id, "analyzing_selected_frames")
        extraction = analyze_selected_frames(frames)
        _stage(job_id, sample_id, "saving_results")
        with SessionLocal() as db:
            sample = db.get(Sample, sample_id)
            job = db.get(ProcessingJob, job_id)
            if not sample or not job:
                raise ValueError("Sample or job missing while saving results.")
            batch = db.get(Batch, sample.batch_id)
            if not batch:
                raise ValueError("Batch missing while saving results.")
            sample.ai_confidence = extraction.overall_confidence
            sample.ai_confidence_reason = extraction.confidence_reason
            sample.label_type = extraction.label_type
            sample.external_sample_id = extraction.sample_id
            existing = {
                field.field_key: field
                for field in db.scalars(
                    select(SampleField).where(SampleField.sample_id == sample_id)
                )
            }
            raw_values = extraction.model_dump()
            for key in FIELD_KEYS:
                forced_empty = (
                    (extraction.label_type == "small" and key == "reference_lube")
                    or (extraction.label_type == "large" and key == "serial_number")
                )
                value = (batch.receiving_date if key == "date_received" else raw_values[key])
                if forced_empty:
                    value = None
                is_unreadable = key in extraction.unreadable_fields
                is_uncertain = key in extraction.uncertain_fields
                status = (
                    "not_applicable" if forced_empty else
                    "unreadable" if is_unreadable else
                    "extracted" if value not in (None, "") else "missing"
                )
                required = key not in ("date_received",) and not forced_empty
                review = required
                reason = (
                    "Handwriting/visual ambiguity reported by Gemini"
                    if is_uncertain or is_unreadable
                    else "Human verification required before accepting an AI reading"
                    if review else None
                )
                field = existing.get(key)
                if field is None:
                    field = SampleField(sample_id=sample_id, field_key=key)
                    db.add(field)
                field.predicted_value = value
                if not field.reviewed:
                    field.current_value = value
                    field.review_required = review
                    field.review_reason = reason
                field.confidence = None
                field.confidence_source = None
                field.status = status
            sample.processing_status = "completed"
            sample.review_status = "pending"
            sample.updated_at = _time()
            job.status = "completed"
            job.current_stage = "completed"
            job.error_message = None
            db.commit()
    except (GeminiRateLimitError, GeminiUnavailableError) as exc:
        reason = "quota" if isinstance(exc, GeminiRateLimitError) else "unavailable"
        # On a Redis outage, fail normally rather than silently claiming work is held.
        set_hold(connection(), reason)
        _pause(job_id, sample_id, reason)
        return
    except Exception as exc:
        with SessionLocal() as db:
            sample = db.get(Sample, sample_id)
            job = db.get(ProcessingJob, job_id)
            if sample:
                sample.processing_status = "failed"
                sample.updated_at = _time()
            if job:
                job.status = "failed"
                job.current_stage = "failed"
                job.error_message = (
                    "Gemini API rate/quota limit (HTTP 429). Retry this sample after "
                    "capacity becomes available; no re-upload required."
                    if isinstance(exc, GeminiRateLimitError) else
                    "Gemini is temporarily overloaded (HTTP 503). Retry this sample "
                    "later; the uploaded video is retained."
                    if isinstance(exc, GeminiUnavailableError) else
                    f"Analysis failed ({type(exc).__name__}). Check worker logs."
                )
            db.commit()
        raise
