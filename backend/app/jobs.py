"""Long-lived RQ task: decode -> local GPU PaddleOCR -> persist."""
import os
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.local_tube_ocr import process_tube_video
from app.models import Batch, ProcessingJob, Sample, SampleField, SampleMedia
from app.schemas import FIELD_KEYS


def _time() -> datetime:
    return datetime.now(timezone.utc)


def _stage(job_id: str, sample_id: str, name: str) -> None:
    with SessionLocal() as db:
        job = db.get(ProcessingJob, job_id)
        sample = db.get(Sample, sample_id)
        if not job or not sample:
            raise ValueError("Processing job or sample no longer exists.")
        job.status = "processing"
        job.current_stage = name
        sample.processing_status = "processing"
        sample.updated_at = _time()
        db.commit()


def process_sample(sample_id: str, job_id: str) -> None:
    settings = get_settings()
    root = Path(settings.media_root).resolve()
    try:
        _stage(job_id, sample_id, "inspecting_video")
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

        # Dedicated output folder for keyframes under media_root/<sample_id>/keyframes
        output_frames_rel = Path(sample_id) / "keyframes"
        output_frames_abs = root / output_frames_rel
        output_frames_abs.mkdir(parents=True, exist_ok=True)

        _stage(job_id, sample_id, "running_gpu_ocr")
        # Run local GPU-accelerated pipeline
        result = process_tube_video(str(video_path), output_dir=str(output_frames_abs))

        tube_type_raw = result.get("tube_type", "Small")
        tube_type = "small" if tube_type_raw.lower() == "small" else "large"
        table_row = result.get("table_row", {})
        timing = result.get("timing", {})

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
                is_annotated = "_annotated" in file_path.name
                rel_path = output_frames_rel / file_path.name
                db.add(
                    SampleMedia(
                        sample_id=sample_id,
                        media_type="keyframe",
                        mime_type="image/jpeg",
                        relative_path=str(rel_path),
                        metadata_json={
                            "filename": file_path.name,
                            "annotated": is_annotated,
                        },
                    )
                )
            db.commit()

        _stage(job_id, sample_id, "saving_results")

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

        # Calculate overall visual confidence for the sample
        conf_scores = [
            info.get("confidence", 0.0)
            for k, info in field_mapping.items()
            if k != "date_received"
            and info.get("value") not in (None, "N/A", "[Leave Blank]")
        ]
        avg_conf = float(np.mean(conf_scores)) if conf_scores else 0.0

        if avg_conf >= 0.93:
            overall_confidence = "high"
            conf_reason = f"High GPU OCR confidence across keyframes (avg: {avg_conf:.1%})"
        elif avg_conf >= 0.78:
            overall_confidence = "medium"
            conf_reason = f"Moderate OCR confidence; check handwritten elements (avg: {avg_conf:.1%})"
        else:
            overall_confidence = "low"
            conf_reason = f"Low clarity or missing label fields (avg: {avg_conf:.1%})"

        sample_id_extracted = field_mapping["sample_id"].get("value")
        if sample_id_extracted in ("N/A", ""):
            sample_id_extracted = None

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
                raw_val = field_data.get("value")
                field_conf = field_data.get("confidence", 0.0)

                if key == "date_received":
                    # Date Received is strictly driven by the Batch entity
                    value = batch.receiving_date
                    field_conf = 1.0
                elif forced_empty or raw_val in ("N/A", "[Leave Blank]", ""):
                    value = None
                else:
                    value = raw_val

                status = (
                    "not_applicable" if forced_empty else
                    "extracted" if value not in (None, "") else "missing"
                )

                # Review required if missing, low confidence, or critical identifier
                review_required = (
                    not forced_empty
                    and key != "date_received"
                    and (value is None or field_conf < 0.90)
                )
                review_reason = (
                    f"OCR confidence ({field_conf:.2f}) requires human verification"
                    if review_required and value is not None
                    else "Missing field on label"
                    if review_required
                    else None
                )

                field = existing.get(key)
                if field is None:
                    field = SampleField(sample_id=sample_id, field_key=key)
                    db.add(field)

                field.predicted_value = value
                if not field.reviewed:
                    field.current_value = value
                    field.review_required = review_required
                    field.review_reason = review_reason

                field.confidence = round(float(field_conf), 3) if value else None
                field.confidence_source = "paddleocr_gpu"
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