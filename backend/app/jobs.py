import logging
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import httpx
from google.genai import errors

from app.db import SessionLocal
from app.gemini import GeminiExtractionService
from app.media import extract_frames, extract_keyframe
from app.models import ProcessingJob, SampleField, SampleMedia
from app.schemas import FIELD_KEYS

logger = logging.getLogger(__name__)


def process_sample_job(job_id: str) -> None:
    with SessionLocal() as db:
        job = db.get(ProcessingJob, UUID(job_id))
        if job is None:
            logger.error("[WORKER] job=%s missing", job_id)
            return
        sample = job.sample
        logger.info("[WORKER] job=%s sample=%s started", job.id, sample.id)
        job.status = "processing"
        job.current_stage = "validating_video"
        job.started_at = datetime.now(UTC)
        sample.processing_status = "processing"
        db.commit()
        try:
            video = next((media for media in sample.media if media.media_type == "video"), None)
            if video is None or not Path(video.storage_path).is_file():
                raise FileNotFoundError("Uploaded video is missing from shared media storage.")
            logger.info("[FILE] job=%s video_found=true", job.id)
            job.current_stage = "uploading_to_gemini"
            db.commit()
            service = GeminiExtractionService()
            extraction = service.extract(Path(video.storage_path))
            job.model_used = service.model_used
            logger.info("[GEMINI] job=%s inference_completed model=%s", job.id, service.model)
            job.current_stage = "saving_results"
            db.commit()
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
            frame_dir = keyframe.parent / f"{sample.id}-frames"
            frames = extract_frames(
                Path(video.storage_path),
                frame_dir,
                service.frame_fps,
                service.max_frames,
            )
            extract_keyframe(Path(video.storage_path), keyframe)
            db.add(SampleMedia(sample_id=sample.id, media_type="keyframe", storage_path=str(keyframe), mime_type="image/jpeg", metadata_json={}))
            for frame in frames:
                db.add(SampleMedia(sample_id=sample.id, media_type="frame", storage_path=str(frame), mime_type="image/jpeg", metadata_json={}))
            sample.label_type = extraction.label_type
            sample.processing_status = "completed"
            sample.review_status = "required" if needs_review else "not_required"
            job.status, job.current_stage = "completed", "complete"
            job.completed_at = datetime.now(UTC)
            logger.info("[JOB] job=%s sample=%s status=completed", job.id, sample.id)
        except (errors.APIError, httpx.HTTPError) as exc:
            sample.processing_status = "failed"
            job.status, job.current_stage, job.error_message = "failed", "error", str(exc)
            job.completed_at = datetime.now(UTC)
            logger.exception("[JOB] job=%s sample=%s status=failed stage=%s", job.id, sample.id, job.current_stage)
        except (OSError, RuntimeError, TypeError, ValueError, KeyError) as exc:
            sample.processing_status = "failed"
            job.status, job.current_stage, job.error_message = "failed", "error", str(exc)
            job.completed_at = datetime.now(UTC)
            logger.exception("[JOB] job=%s sample=%s status=failed stage=%s", job.id, sample.id, job.current_stage)
        db.commit()
