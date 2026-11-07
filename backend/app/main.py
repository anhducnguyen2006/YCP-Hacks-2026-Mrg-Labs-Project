"""MRG Sample Scanner HTTP API backed by PostgreSQL and RQ."""
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from redis import Redis
from rq import Queue
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Batch, ProcessingJob, Sample, SampleField, SampleMedia, uid
from app.schemas import (
    FIELD_KEYS, BatchCreate, BatchOut, FieldCorrection, SampleOut,
)
from app.store import batch_out, sample_out

settings = get_settings()
app = FastAPI(title="MRG Sample Scanner API", version="0.2.0")
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins,
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

VIDEO_TYPES = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
}
MAX_UPLOAD = 50 * 1024 * 1024


def _now() -> datetime:
    return datetime.now(timezone.utc)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "mrg-sample-scanner-api"}


@app.get("/api/batches", response_model=list[BatchOut])
def list_batches(db: Session = Depends(get_db)) -> list[BatchOut]:
    return [batch_out(b) for b in db.scalars(select(Batch).order_by(Batch.created_at.desc()))]


@app.post("/api/batches", response_model=BatchOut, status_code=201)
def create_batch(payload: BatchCreate, db: Session = Depends(get_db)) -> BatchOut:
    batch = Batch(
        name=payload.name.strip(), receiving_date=payload.receiving_date.isoformat(),
        default_export_filename=payload.default_export_filename,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch_out(batch)


@app.get("/api/batches/{batch_id}/samples", response_model=list[SampleOut])
def list_samples(
    batch_id: str, offset: int = 0, limit: int = 50, db: Session = Depends(get_db)
) -> list[SampleOut]:
    if db.get(Batch, batch_id) is None:
        raise HTTPException(404, "Batch not found.")
    if offset < 0 or not 1 <= limit <= 100:
        raise HTTPException(422, "Invalid pagination parameters.")
    samples = db.scalars(
        select(Sample).where(Sample.batch_id == batch_id)
        .order_by(Sample.created_at.desc(), Sample.id.desc())
        .offset(offset).limit(limit)
    ).all()
    return [sample_out(db, s) for s in samples]


@app.post("/api/batches/{batch_id}/samples", response_model=SampleOut, status_code=201)
async def upload_sample(
    batch_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)
) -> SampleOut:
    if db.get(Batch, batch_id) is None:
        raise HTTPException(404, "Batch not found.")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in VIDEO_TYPES:
        raise HTTPException(415, "Upload a .mp4, .mov, or .webm video.")
    sample = Sample(id=uid(), batch_id=batch_id, processing_status="queued")
    relative = Path(sample.id) / f"original{suffix}"
    output = Path(settings.media_root).resolve() / relative
    output.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    try:
        with output.open("wb") as handle:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_UPLOAD:
                    raise HTTPException(413, "Video must be 50 MB or smaller.")
                handle.write(chunk)
        if total == 0:
            raise HTTPException(422, "Uploaded video is empty.")
        db.add(sample)
        db.add(SampleMedia(
            sample_id=sample.id, media_type="video", mime_type=VIDEO_TYPES[suffix],
            relative_path=str(relative), metadata_json={"size_bytes": total},
        ))
        db.commit()
        return sample_out(db, sample)
    except Exception:
        output.unlink(missing_ok=True)
        db.rollback()
        raise
    finally:
        await file.close()


@app.post("/api/samples/{sample_id}/analyze", response_model=SampleOut)
def analyze_sample(sample_id: str, db: Session = Depends(get_db)) -> SampleOut:
    sample = db.get(Sample, sample_id)
    if not sample:
        raise HTTPException(404, "Sample not found.")
    if sample.processing_status == "processing":
        raise HTTPException(409, "Sample is already processing.")
    latest = db.scalars(
        select(ProcessingJob).where(ProcessingJob.sample_id == sample_id)
        .order_by(ProcessingJob.created_at.desc(), ProcessingJob.id.desc()).limit(1)
    ).first()
    if latest and latest.status == "queued":
        return sample_out(db, sample)
    if sample.processing_status == "completed":
        raise HTTPException(409, "Analysis already completed. Use Review to correct values.")
    job = ProcessingJob(sample_id=sample_id, status="queued", current_stage="queued")
    db.add(job)
    sample.processing_status = "queued"
    sample.updated_at = _now()
    db.commit()
    try:
        queue = Queue("mrg-scanner", connection=Redis.from_url(settings.redis_url))
        queue.enqueue(
            "app.jobs.process_sample", sample.id, job.id,
            job_timeout=300, result_ttl=3600,
            job_id=job.id,
        )
    except Exception:
        job.status = "failed"
        job.current_stage = "failed"
        job.error_message = "Unable to queue analysis. Check Redis and worker status."
        sample.processing_status = "failed"
        db.commit()
        raise HTTPException(503, "Unable to queue analysis. Check Redis and worker status.")
    return sample_out(db, sample)


@app.get("/api/samples/{sample_id}", response_model=SampleOut)
def get_sample(sample_id: str, db: Session = Depends(get_db)) -> SampleOut:
    sample = db.get(Sample, sample_id)
    if not sample:
        raise HTTPException(404, "Sample not found.")
    return sample_out(db, sample)


@app.patch("/api/samples/{sample_id}/fields/{field_key}", response_model=SampleOut)
def update_field(
    sample_id: str, field_key: str, payload: FieldCorrection,
    db: Session = Depends(get_db),
) -> SampleOut:
    sample = db.get(Sample, sample_id)
    if not sample:
        raise HTTPException(404, "Sample not found.")
    if field_key not in FIELD_KEYS:
        raise HTTPException(404, "Unknown field.")
    field = db.scalars(
        select(SampleField).where(
            SampleField.sample_id == sample_id, SampleField.field_key == field_key
        )
    ).first()
    if field is None:
        raise HTTPException(404, "Field not extracted.")
    field.current_value = payload.current_value
    field.reviewed = True
    field.review_required = False
    field.review_reason = None
    sample.review_status = "pending"
    sample.updated_at = _now()
    db.commit()
    return sample_out(db, sample)


@app.get("/api/media/{media_id}")
def get_media(media_id: str, db: Session = Depends(get_db)) -> FileResponse:
    media = db.get(SampleMedia, media_id)
    if not media:
        raise HTTPException(404, "Media not found.")
    root = Path(settings.media_root).resolve()
    path = (root / media.relative_path).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(404, "Media file unavailable.")
    return FileResponse(path, media_type=media.mime_type)
