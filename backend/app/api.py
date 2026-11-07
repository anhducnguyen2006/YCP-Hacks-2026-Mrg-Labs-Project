from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.db import get_db
from app.jobs import process_sample_job
from app.media import inspect_video
from app.models import Batch, ProcessingJob, Sample, SampleField, SampleMedia
from app.schemas import BatchCreate, BatchRead, BatchUpdate, SampleFieldUpdate, SampleRead
from app.storage import SAFE_MIME_TYPES, safe_video_path, save_upload, validate_filename

router = APIRouter(prefix="/api")


def sample_query():
    return select(Sample).options(selectinload(Sample.fields), selectinload(Sample.media), selectinload(Sample.jobs))


def serialize_sample(sample: Sample) -> SampleRead:
    data = SampleRead.model_validate(sample)
    data.latest_job = max(sample.jobs, key=lambda job: job.queued_at) if sample.jobs else None
    return data


@router.post("/batches", response_model=BatchRead, status_code=status.HTTP_201_CREATED)
def create_batch(payload: BatchCreate, db: Session = Depends(get_db)) -> Batch:
    batch = Batch(**payload.model_dump())
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


@router.get("/batches", response_model=list[BatchRead])
def list_batches(db: Session = Depends(get_db)) -> list[Batch]:
    return list(db.scalars(select(Batch).order_by(Batch.created_at.desc())).all())


@router.get("/batches/{batch_id}", response_model=BatchRead)
def get_batch(batch_id: UUID, db: Session = Depends(get_db)) -> Batch:
    batch = db.get(Batch, batch_id)
    if not batch:
        raise HTTPException(404, "Batch not found.")
    return batch


@router.patch("/batches/{batch_id}", response_model=BatchRead)
def update_batch(batch_id: UUID, payload: BatchUpdate, db: Session = Depends(get_db)) -> Batch:
    batch = db.get(Batch, batch_id)
    if not batch:
        raise HTTPException(404, "Batch not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(batch, key, value)
    db.commit()
    db.refresh(batch)
    return batch


@router.delete("/batches/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_batch(batch_id: UUID, db: Session = Depends(get_db)) -> None:
    batch = db.get(Batch, batch_id)
    if not batch:
        raise HTTPException(404, "Batch not found.")
    db.delete(batch)
    db.commit()


@router.get("/batches/{batch_id}/samples", response_model=list[SampleRead])
def list_samples(batch_id: UUID, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), db: Session = Depends(get_db)) -> list[SampleRead]:
    if not db.get(Batch, batch_id):
        raise HTTPException(404, "Batch not found.")
    samples = db.scalars(sample_query().where(Sample.batch_id == batch_id).order_by(Sample.created_at.desc()).offset(offset).limit(limit)).unique().all()
    return [serialize_sample(sample) for sample in samples]


@router.post("/batches/{batch_id}/samples", response_model=SampleRead, status_code=status.HTTP_201_CREATED)
async def upload_sample(batch_id: UUID, file: UploadFile = File(...), db: Session = Depends(get_db)) -> SampleRead:
    batch = db.get(Batch, batch_id)
    if not batch:
        raise HTTPException(404, "Batch not found.")
    try:
        validate_filename(file.filename)
        if file.content_type not in SAFE_MIME_TYPES:
            raise ValueError("Unsupported video MIME type. Use MP4, MOV, or WebM.")
        settings = get_settings()
        path = safe_video_path(Path(settings.media_root) / "videos", file.content_type)
        size = await save_upload(file, path, settings.max_video_size_bytes)
        metadata = inspect_video(path, settings.max_video_duration_seconds)
    except (ValueError, OSError) as exc:
        raise HTTPException(400, str(exc)) from exc
    sample = Sample(batch_id=batch.id)
    db.add(sample)
    db.flush()
    db.add(SampleMedia(sample_id=sample.id, media_type="video", storage_path=str(path), mime_type=file.content_type, metadata_json={"size_bytes": size, **metadata}))
    job = ProcessingJob(sample_id=sample.id)
    db.add(job)
    db.commit()
    db.refresh(sample)
    return serialize_sample(db.scalars(sample_query().where(Sample.id == sample.id)).unique().one())


@router.get("/samples/{sample_id}", response_model=SampleRead)
def get_sample(sample_id: UUID, db: Session = Depends(get_db)) -> SampleRead:
    sample = db.scalars(sample_query().where(Sample.id == sample_id)).unique().one_or_none()
    if not sample:
        raise HTTPException(404, "Sample not found.")
    return serialize_sample(sample)


@router.delete("/samples/{sample_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sample(sample_id: UUID, db: Session = Depends(get_db)) -> None:
    sample = db.get(Sample, sample_id)
    if not sample:
        raise HTTPException(404, "Sample not found.")
    db.delete(sample)
    db.commit()


@router.post("/samples/{sample_id}/analyze", response_model=SampleRead)
def analyze_sample(sample_id: UUID, db: Session = Depends(get_db)) -> SampleRead:
    sample = db.scalars(sample_query().where(Sample.id == sample_id)).unique().one_or_none()
    if not sample:
        raise HTTPException(404, "Sample not found.")
    job = max(sample.jobs, key=lambda item: item.queued_at, default=None)
    if job is None or job.status not in {"queued", "failed"}:
        raise HTTPException(409, "Sample is already being processed or has completed.")
    job.status, job.current_stage, job.error_message = "queued", "queued", None
    db.commit()
    try:
        from redis import Redis
        from rq import Queue, Retry

        Queue("mrg-scanner", connection=Redis.from_url(get_settings().redis_url)).enqueue(
            process_sample_job,
            str(job.id),
            retry=Retry(max=2, interval=[10, 30]),
            job_timeout=600,
        )
    except Exception as exc:
        raise HTTPException(503, "Unable to queue sample processing.") from exc
    return serialize_sample(sample)


@router.patch("/samples/{sample_id}/fields/{field_key}", response_model=SampleRead)
def update_field(sample_id: UUID, field_key: str, payload: SampleFieldUpdate, db: Session = Depends(get_db)) -> SampleRead:
    field = db.scalar(select(SampleField).where(SampleField.sample_id == sample_id, SampleField.field_key == field_key))
    if not field:
        raise HTTPException(404, "Sample field not found.")
    field.current_value = payload.current_value or ""
    field.reviewed = True
    field.review_required = False
    field.review_reason = None
    db.commit()
    sample = db.scalars(sample_query().where(Sample.id == sample_id)).unique().one()
    return serialize_sample(sample)


@router.get("/media/{media_id}")
def get_media(media_id: UUID, db: Session = Depends(get_db)):
    media = db.get(SampleMedia, media_id)
    if not media or not Path(media.storage_path).is_file():
        raise HTTPException(404, "Media not found.")
    from fastapi.responses import FileResponse

    return FileResponse(media.storage_path, media_type=media.mime_type)
