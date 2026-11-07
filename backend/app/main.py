"""MRG Sample Scanner HTTP API backed by PostgreSQL and RQ."""
import csv
import io
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from redis import Redis
from rq import Queue
from sqlalchemy import select, func, or_, exists
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Batch, ProcessingJob, Sample, SampleField, SampleMedia, uid
from app.schemas import (
    FIELD_KEYS, BatchCreate, BatchOut, BatchStatusOut, BatchSampleStatusOut, FieldCorrection, SampleOut, InventoryOut,
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



# Keep the historical template spelling and column order exactly as specified.
CSV_HEADERS = (
    "Sample ID", "Date Sampled", "Date Received", "Machine",
    "Component", "Serial Number", "Refrence Lube",
)


@app.get("/api/batches/{batch_id}/status", response_model=BatchStatusOut)
def batch_status(batch_id: str, db: Session = Depends(get_db)) -> BatchStatusOut:
    """One lightweight polling request for the whole batch, including per-video status."""
    if db.get(Batch, batch_id) is None:
        raise HTTPException(404, "Batch not found.")
    items = db.execute(
        select(Sample.id, Sample.processing_status)
        .where(Sample.batch_id == batch_id)
        .order_by(Sample.created_at, Sample.id)
    ).all()
    counts = {status: 0 for status in ("queued", "processing", "completed", "failed")}
    for _, status in items:
        counts[status] = counts.get(status, 0) + 1
    ids = [sample_id for sample_id, _ in items]
    needs_review = 0
    if ids:
        needs_review = len(db.scalars(
            select(SampleField.sample_id).where(
                SampleField.sample_id.in_(ids),
                SampleField.review_required.is_(True),
                SampleField.reviewed.is_(False),
            ).distinct()
        ).all())
    return BatchStatusOut(
        total=len(items), queued=counts["queued"], processing=counts["processing"],
        completed=counts["completed"], failed=counts["failed"],
        needs_review=needs_review,
        items=[BatchSampleStatusOut(id=sid, status=status) for sid, status in items],
    )


@app.get("/api/batches/{batch_id}/export.csv")
def export_batch_csv(
    batch_id: str, reviewed_only: bool = False, db: Session = Depends(get_db)
) -> Response:
    """Download all completed samples, not just the first paginated frontend page."""
    batch = db.get(Batch, batch_id)
    if batch is None:
        raise HTTPException(404, "Batch not found.")
    samples = db.scalars(
        select(Sample).where(
            Sample.batch_id == batch_id, Sample.processing_status == "completed"
        ).order_by(Sample.created_at, Sample.id)
    ).all()
    ids = [sample.id for sample in samples]
    fields_by_sample: dict[str, dict[str, SampleField]] = {sid: {} for sid in ids}
    if ids:
        for field in db.scalars(
            select(SampleField).where(SampleField.sample_id.in_(ids))
        ):
            fields_by_sample[field.sample_id][field.field_key] = field
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(CSV_HEADERS)
    for sample in samples:
        fields = fields_by_sample[sample.id]
        if reviewed_only and any(
            field.review_required and not field.reviewed
            for field in fields.values()
        ):
            continue
        values = [
            (fields.get(key).current_value if fields.get(key) else None) or ""
            for key in FIELD_KEYS
        ]
        # Date Received is a property of the batch; Gemini must never supply it.
        values[2] = batch.receiving_date
        writer.writerow(values)
    # Keep filename ASCII-only for a safe HTTP Content-Disposition value.
    filename = re.sub(r"[^A-Za-z0-9._-]", "_", batch.default_export_filename)
    if not filename.lower().endswith(".csv"):
        filename = "mrg-samples.csv"
    return Response(
        content=output.getvalue(), media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


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



@app.get("/api/batches/{batch_id}/inventory", response_model=InventoryOut)
def inventory(
    batch_id: str, search: str = "", sort_by: str = "created_at",
    descending: bool = True, status: str = "all",
    offset: int = 0, limit: int = 50, db: Session = Depends(get_db),
) -> InventoryOut:
    """Search and sort all batch records before applying pagination."""
    if db.get(Batch, batch_id) is None:
        raise HTTPException(404, "Batch not found.")
    if offset < 0 or not 1 <= limit <= 100 or len(search) > 200:
        raise HTTPException(422, "Invalid inventory query.")
    sortable = {
        "sample_id", "date_sampled", "date_received", "machine",
        "component", "serial_number", "reference_lube",
    }
    if sort_by not in sortable | {"created_at", "confidence"}:
        raise HTTPException(422, "Unsupported sort field.")
    if status not in {"all", "queued", "processing", "completed", "failed", "review"}:
        raise HTTPException(422, "Unsupported status.")
    stmt = select(Sample).where(Sample.batch_id == batch_id)
    term = search.strip().lower()
    if term:
        matching_field = exists(select(SampleField.id).where(
            SampleField.sample_id == Sample.id,
            func.lower(SampleField.current_value).contains(term),
        ))
        stmt = stmt.where(or_(
            func.lower(Sample.id).contains(term),
            func.lower(Sample.external_sample_id).contains(term),
            matching_field,
        ))
    if status == "review":
        stmt = stmt.where(exists(select(SampleField.id).where(
            SampleField.sample_id == Sample.id,
            SampleField.review_required.is_(True),
            SampleField.reviewed.is_(False),
        )))
    elif status != "all":
        stmt = stmt.where(Sample.processing_status == status)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    if sort_by in sortable:
        key = select(SampleField.current_value).where(
            SampleField.sample_id == Sample.id, SampleField.field_key == sort_by
        ).correlate(Sample).scalar_subquery()
    elif sort_by == "confidence":
        key = Sample.ai_confidence
    else:
        key = Sample.created_at
    stmt = stmt.order_by(
        key.desc().nullslast() if descending else key.asc().nullsfirst(),
        Sample.created_at.desc(), Sample.id.desc(),
    ).offset(offset).limit(limit)
    return InventoryOut(total=total, items=[sample_out(db, s) for s in db.scalars(stmt)])


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
