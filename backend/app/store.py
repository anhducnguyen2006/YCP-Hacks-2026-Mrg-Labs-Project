"""Shape SQLAlchemy records for the existing TypeScript frontend contract."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Batch, ProcessingJob, Sample, SampleField, SampleMedia
from app.schemas import BatchOut, FieldOut, JobOut, MediaOut, SampleOut


def batch_out(row: Batch) -> BatchOut:
    return BatchOut.model_validate({
        "id": row.id, "name": row.name, "receiving_date": row.receiving_date,
        "default_export_filename": row.default_export_filename,
        "created_at": row.created_at, "updated_at": row.updated_at,
    })


def sample_out(db: Session, sample: Sample) -> SampleOut:
    fields = db.scalars(select(SampleField).where(SampleField.sample_id == sample.id)).all()
    media = db.scalars(select(SampleMedia).where(SampleMedia.sample_id == sample.id)).all()
    job = db.scalars(
        select(ProcessingJob).where(ProcessingJob.sample_id == sample.id)
        .order_by(ProcessingJob.created_at.desc(), ProcessingJob.id.desc()).limit(1)
    ).first()
    return SampleOut(
        id=sample.id, batch_id=sample.batch_id,
        external_sample_id=sample.external_sample_id, label_type=sample.label_type,
        processing_status=sample.processing_status, review_status=sample.review_status,
        ai_confidence=sample.ai_confidence, ai_confidence_reason=sample.ai_confidence_reason,
        created_at=sample.created_at, updated_at=sample.updated_at,
        fields=[FieldOut.model_validate({
            "id": f.id, "field_key": f.field_key, "predicted_value": f.predicted_value,
            "current_value": f.current_value, "confidence": f.confidence,
            "confidence_source": f.confidence_source, "status": f.status,
            "review_required": f.review_required, "reviewed": f.reviewed,
            "review_reason": f.review_reason,
        }) for f in fields],
        media=[MediaOut.model_validate({
            "id": m.id, "media_type": m.media_type, "mime_type": m.mime_type,
            "metadata_json": m.metadata_json,
        }) for m in media],
        latest_job=JobOut(
            status=job.status, current_stage=job.current_stage,
            error_message=job.error_message,
        ) if job is not None else None,
    )
