from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from google.genai import errors

from app.db import SessionLocal
from app.gemini import GeminiExtractionService
from app.media import extract_keyframe
from app.models import ProcessingJob, SampleField, SampleMedia
from app.schemas import FIELD_KEYS


def process_sample_job(job_id: str) -> None:
    with SessionLocal() as db:
        job = db.get(ProcessingJob, UUID(job_id))
        if job is None:
            return
        sample = job.sample
        job.status = "processing"
        job.current_stage = "analyzing_video"
        job.started_at = datetime.now(UTC)
        sample.processing_status = "processing"
        db.commit()
        try:
            video = next(media for media in sample.media if media.media_type == "video")
            service = GeminiExtractionService()
            extraction = service.extract(Path(video.storage_path))
            batch_date = sample.batch.receiving_date.isoformat()
            needs_review = False
            for key in FIELD_KEYS:
                result = getattr(extraction.fields, key)
                if key == "date_received":
                    value, status, reason = batch_date, "extracted", None
                elif result is None:
                    value, status, reason = None, "missing", "Gemini did not return this field."
                else:
                    value, status, reason = result.value, result.status, result.reason
                field = next((item for item in sample.fields if item.field_key == key), None)
                if field is None:
                    field = SampleField(sample_id=sample.id, field_key=key)
                    db.add(field)
                field.predicted_value = value
                if not field.reviewed:
                    field.current_value = value or ""
                field.status = status
                field.confidence = result.confidence if result else None
                field.confidence_source = "gemini_subjective" if result and result.confidence is not None else None
                field.review_required = bool((result and result.uncertain) or status in {"unreadable", "missing"})
                needs_review = needs_review or field.review_required
                field.review_reason = reason
            keyframe = Path(video.storage_path).with_name(f"{sample.id}-keyframe.jpg")
            extract_keyframe(Path(video.storage_path), keyframe)
            db.add(SampleMedia(sample_id=sample.id, media_type="keyframe", storage_path=str(keyframe), mime_type="image/jpeg", metadata_json={}))
            sample.label_type = extraction.label_type
            sample.processing_status = "completed"
            sample.review_status = "required" if needs_review else "not_required"
            job.status, job.current_stage = "completed", "complete"
            job.completed_at = datetime.now(UTC)
        except errors.APIError as exc:
            sample.processing_status = "failed"
            job.status, job.current_stage, job.error_message = "failed", "error", str(exc)
            job.completed_at = datetime.now(UTC)
            db.commit()
            if getattr(exc, "code", None) in {429, 500, 502, 503, 504}:
                job.status, job.current_stage = "queued", "retrying"
                sample.processing_status = "processing"
                db.commit()
                raise
        except (OSError, RuntimeError, TypeError, ValueError, KeyError) as exc:
            sample.processing_status = "failed"
            job.status, job.current_stage, job.error_message = "failed", "error", str(exc)
            job.completed_at = datetime.now(UTC)
        db.commit()
