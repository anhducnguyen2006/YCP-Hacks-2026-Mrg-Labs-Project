"""Long-lived RQ task: decode -> local PaddleOCR -> preserve structured data."""
import os
import re
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.local_tube_ocr import process_tube_video
from app.models import Batch, ProcessingJob, Sample, SampleField, SampleMedia
from app.ocr_contract import assess_fields, clean_value, confidence_score, sampled_date
from app.schemas import FIELD_KEYS


def _time() -> datetime:
    return datetime.now(UTC)


def _stage(job_id: str, sample_id: str, name: str) -> bool:
    with SessionLocal() as db:
        job = db.get(ProcessingJob, job_id)
        sample = db.get(Sample, sample_id)
        if not job or not sample:
            raise ValueError("Processing job or sample no longer exists.")
        if job.status == "canceled" or sample.processing_status == "canceled":
            return False
        job.status = "processing"
        job.current_stage = name
        sample.processing_status = "processing"
        sample.updated_at = _time()
        db.commit()
    return True


def process_sample(sample_id: str, job_id: str) -> None:
    settings = get_settings()
    root = Path(settings.media_root).resolve()
    try:
        if not _stage(job_id, sample_id, "inspecting_video"):
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

        # Attempt-specific output avoids stale images surviving retries.
        output_frames_rel = Path(sample_id) / job_id / "keyframes"
        output_frames_abs = root / output_frames_rel
        output_frames_abs.mkdir(parents=True, exist_ok=True)

        if not _stage(job_id, sample_id, "running_ocr"):
            return
        # Run local OCR on CPU by default; NVIDIA GPU is opt-in.
        result = process_tube_video(str(video_path), output_dir=str(output_frames_abs))

        tube_type_raw = result.get("tube_type", "Small")
        tube_type = "small" if tube_type_raw.lower() == "small" else "large"
        table_row = result.get("table_row", {})
        # Clear any prior keyframe media records for retried runs
        with SessionLocal() as db:
            old_frames = db.scalars(
                select(SampleMedia).where(
                    SampleMedia.sample_id == sample_id, SampleMedia.media_type == "keyframe"
                )
            ).all()
            for old in old_frames:
                db.delete(old)

            # Register extracted keyframe and annotated images into SampleMedia
            for file_path in sorted(output_frames_abs.glob("frame_*.jpg")):
                # Exactly the eight selected original frames; annotated overlays
                # are diagnostics and should not double the user-visible gallery.
                if "_annotated" in file_path.name:
                    continue
                match = re.fullmatch(r"frame_(\d+)_id(\d+)\.jpg", file_path.name)
                if match is None:
                    continue
                rel_path = output_frames_rel / file_path.name
                db.add(
                    SampleMedia(
                        sample_id=sample_id,
                        media_type="keyframe",
                        mime_type="image/jpeg",
                        relative_path=str(rel_path),
                        metadata_json={
                            "filename": file_path.name,
                            "annotated": False,
                            "frame_rank": int(match.group(1)),
                            "frame_index": int(match.group(2)),
                        },
                    )
                )
            db.commit()

        if not _stage(job_id, sample_id, "saving_results"):
            return

        # Map local OCR table_row keys to standard backend FIELD_KEYS
        field_mapping = {
            "sample_id": table_row.get("Sample ID", {}),
            "date_sampled": table_row.get("Date Sampled", {}),
            "date_received": table_row.get("Date Received", {}),
            "machine": table_row.get("Machine", {}),
            "component": table_row.get("Component", {}),
            "serial_number": table_row.get("Serial Number", {}),
            "reference_lube": table_row.get("Reference Lube", {}),
        }

        # Normalize OCR-only dates before quality checks and CSV export.
        raw_date = field_mapping["date_sampled"].get("value")
        date_value, date_valid = sampled_date(raw_date)
        field_mapping["date_sampled"] = {
            **field_mapping["date_sampled"],
            "value": date_value,
            "date_valid": date_valid,
        }
        overall_confidence, conf_reason = assess_fields(field_mapping, tube_type)
        if date_value is not None and not date_valid:
            overall_confidence = "low"
            conf_reason = "Incomplete or invalid sampled date; check the original label."

        sample_id_extracted = clean_value(field_mapping["sample_id"].get("value"))

        with SessionLocal() as db:
            sample = db.get(Sample, sample_id)
            job = db.get(ProcessingJob, job_id)
            if not sample or not job:
                raise ValueError("Sample or job missing while saving results.")
            batch = db.get(Batch, sample.batch_id)
            if not batch:
                raise ValueError("Batch missing while saving results.")

            sample.ai_confidence = overall_confidence
            sample.ai_confidence_reason = conf_reason
            sample.label_type = tube_type
            sample.external_sample_id = sample_id_extracted

            existing = {
                field.field_key: field
                for field in db.scalars(
                    select(SampleField).where(SampleField.sample_id == sample_id)
                )
            }

            for key in FIELD_KEYS:
                forced_empty = (
                    (tube_type == "small" and key == "reference_lube")
                    or (tube_type == "large" and key == "serial_number")
                )

                field_data = field_mapping.get(key, {})
                value = clean_value(field_data.get("value"))
                score = confidence_score(field_data.get("confidence"))
                if key == "date_received":
                    value = batch.receiving_date
                    score = None  # Batch metadata, not an OCR reading.
                elif forced_empty:
                    value = None
                    score = None

                invalid_date = (key == "date_sampled" and value is not None
                                and not field_data.get("date_valid", False))
                status = (
                    "not_applicable" if forced_empty else
                    "invalid_date" if invalid_date else
                    "extracted" if value is not None else "missing"
                )
                required = key in {"sample_id", "date_sampled", "machine", "component"}
                low_score = value is not None and score is not None and score < 0.90
                unknown_score = value is not None and score is None and key != "date_received"
                # A blank optional serial number / lube box is not evidence of
                # unreadable text. Missing required values do need a check.
                review_required = (
                    not forced_empty and key != "date_received"
                    and (invalid_date or (required and value is None)
                         or low_score or unknown_score)
                )
                if invalid_date:
                    review_reason = "Invalid/incomplete OCR date; inspect original label."
                elif required and value is None:
                    review_reason = "No value extracted for a required field; check source label."
                elif low_score:
                    review_reason = f"Low OCR recognition score ({score:.2f}); confirm source text."
                elif unknown_score:
                    review_reason = "OCR confidence unavailable; confirm source text."
                else:
                    review_reason = None

                field = existing.get(key)
                if field is None:
                    field = SampleField(sample_id=sample_id, field_key=key)
                    db.add(field)

                field.predicted_value = value
                if not field.reviewed:
                    field.current_value = value
                    field.review_required = review_required
                    field.review_reason = review_reason

                field.confidence = round(score, 3) if score is not None and value else None
                field.confidence_source = (
                    "derived_heuristic" if key == "component" and tube_type == "small"
                    else "paddleocr_gpu" if os.getenv("OCR_DEVICE", "cpu").startswith("gpu")
                    else "paddleocr_cpu"
                ) if key != "date_received" and value else None
                field.status = status

            sample.processing_status = "completed"
            sample.review_status = "pending"
            sample.updated_at = _time()
            job.status = "completed"
            job.current_stage = "completed"
            job.error_message = None
            db.commit()

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
                job.error_message = f"Local OCR failed ({type(exc).__name__}): {exc}"
            db.commit()
        raise