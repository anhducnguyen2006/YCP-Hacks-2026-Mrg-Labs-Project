"""MRG Sample Scanner HTTP API backed by PostgreSQL and RQ."""
import csv
import io
import logging
import re
from datetime import UTC, datetime
from pathlib import Path
from shutil import rmtree

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from redis import Redis
from rq import Queue
from rq.exceptions import NoSuchJobError
from rq.job import Job
from sqlalchemy import case, exists, func, or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Batch, ProcessingJob, Sample, SampleField, SampleMedia, uid
from app.quality import batch_quality
from app.schemas import (
    FIELD_KEYS,
    BatchCreate,
    BatchOut,
    BatchSampleStatusOut,
    BatchStatusOut,
    FieldCorrection,
    InventoryOut,
    SampleDeleteRequest,
    SampleOut,
    SelectiveExportRequest,
)
from app.store import batch_out, sample_out

logger = logging.getLogger(__name__)
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
    return datetime.now(UTC)


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


@app.get("/api/batches/{batch_id}/quality")
def quality_report(batch_id: str, db: Session = Depends(get_db)) -> dict:
    """Detect suspicious or unreadable fields across the complete batch."""
    if db.get(Batch, batch_id) is None:
        raise HTTPException(404, "Batch not found.")
    return batch_quality(db, batch_id)


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
    counts = {status: 0 for status in ("queued", "processing", "completed", "failed", "canceled")}
    for _, status in items:
        counts[status] = counts.get(status, 0) + 1
    needs_review = db.scalar(
        select(func.count()).select_from(Sample).where(
            Sample.batch_id == batch_id,
            Sample.processing_status == "completed",
            Sample.review_status != "verified",
        )
    ) or 0
    return BatchStatusOut(
        total=len(items), queued=counts["queued"], processing=counts["processing"],
        completed=counts["completed"], failed=counts["failed"],
        canceled=counts["canceled"],
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
        if reviewed_only and sample.review_status != "verified":
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


@app.get("/api/batches/{batch_id}/export-preview")
def export_preview(batch_id: str, db: Session = Depends(get_db)) -> list[dict]:
    """Lightweight preview of all completed records, including later pages."""
    if db.get(Batch, batch_id) is None:
        raise HTTPException(404, "Batch not found.")
    samples = db.scalars(select(Sample).where(
        Sample.batch_id == batch_id,
        Sample.processing_status == "completed",
    ).order_by(Sample.created_at, Sample.id)).all()
    ids = [sample.id for sample in samples]
    labels: dict[str, str] = {}
    if ids:
        for sid, label in db.execute(select(
            SampleField.sample_id, SampleField.current_value,
        ).where(
            SampleField.sample_id.in_(ids), SampleField.field_key == "sample_id",
        )):
            labels[sid] = label or ""
    return [{
        "id": sample.id,
        "label": labels.get(sample.id) or sample.external_sample_id or sample.id[:8],
        "verified": sample.review_status == "verified",
    } for sample in samples]


@app.post("/api/batches/{batch_id}/export-selected.csv")
def export_selected_csv(
    batch_id: str, payload: SelectiveExportRequest, db: Session = Depends(get_db)
) -> Response:
    """Export exactly the chosen completed records, preserving seven CSV columns."""
    batch = db.get(Batch, batch_id)
    if batch is None:
        raise HTTPException(404, "Batch not found.")
    ids = list(dict.fromkeys(payload.sample_ids))
    samples = db.scalars(select(Sample).where(
        Sample.batch_id == batch_id, Sample.id.in_(ids)
    )).all()
    if len(samples) != len(ids):
        raise HTTPException(422, "Selected samples must all belong to this batch.")
    if any(sample.processing_status != "completed" for sample in samples):
        raise HTTPException(422, "Only completed samples may be exported.")
    if payload.verified_only and any(sample.review_status != "verified" for sample in samples):
        raise HTTPException(422, "Selection contains unverified samples.")
    values = {sid: {} for sid in ids}
    for field in db.scalars(select(SampleField).where(SampleField.sample_id.in_(ids))):
        values[field.sample_id][field.field_key] = field.current_value or ""
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(CSV_HEADERS)
    for sid in ids:
        row = [values[sid].get(key, "") for key in FIELD_KEYS]
        row[2] = batch.receiving_date
        writer.writerow(row)
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
    descending: bool = True, status: str = "all", confidence: str = "all",
    offset: int = 0, limit: int = 50, flagged_only: bool = False,
    db: Session = Depends(get_db),
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
    if confidence not in {"all", "high", "medium", "low", "unrated"}:
        raise HTTPException(422, "Unsupported confidence filter.")
    stmt = select(Sample).where(Sample.batch_id == batch_id)
    if flagged_only:
        flagged = batch_quality(db, batch_id)["flags"]
        stmt = stmt.where(
            Sample.id.in_(list(flagged.keys())),
            Sample.review_status != "verified",
        )
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
        stmt = stmt.where(
            Sample.processing_status == "completed",
            Sample.review_status != "verified",
        )
    elif status != "all":
        stmt = stmt.where(Sample.processing_status == status)
    if confidence == "unrated":
        stmt = stmt.where(Sample.ai_confidence.is_(None))
    elif confidence != "all":
        stmt = stmt.where(Sample.ai_confidence == confidence)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    if sort_by in sortable:
        key = select(SampleField.current_value).where(
            SampleField.sample_id == Sample.id, SampleField.field_key == sort_by
        ).correlate(Sample).scalar_subquery()
    elif sort_by == "confidence":
        key = case(
            (Sample.ai_confidence == "high", 3),
            (Sample.ai_confidence == "medium", 2),
            (Sample.ai_confidence == "low", 1),
            else_=0,
        )
    else:
        key = Sample.created_at
    stmt = stmt.order_by(
        key.desc().nullslast() if descending else key.asc().nullsfirst(),
        Sample.created_at.desc(), Sample.id.desc(),
    ).offset(offset).limit(limit)
    return InventoryOut(total=total, items=[sample_out(db, s) for s in db.scalars(stmt)])



@app.post("/api/batches/{batch_id}/cancel-queued")
def cancel_queued_jobs(batch_id: str, db: Session = Depends(get_db)) -> dict[str, int]:
    """Cancel only RQ jobs that have not started; never interrupt active Gemini calls."""
    if db.get(Batch, batch_id) is None:
        raise HTTPException(404, "Batch not found.")
    redis = Redis.from_url(settings.redis_url)
    jobs = db.scalars(select(ProcessingJob).join(
        Sample, ProcessingJob.sample_id == Sample.id,
    ).where(
        Sample.batch_id == batch_id,
        ProcessingJob.status == "queued",
    ).with_for_update()).all()
    cancelled = 0
    for job in jobs:
        sample = db.get(Sample, job.sample_id)
        if sample is None or sample.processing_status != "queued":
            continue
        try:
            rq_job = Job.fetch(job.id, connection=redis)
            if rq_job.get_status(refresh=True) != "queued":
                continue
            rq_job.cancel()
        except NoSuchJobError:
            # The task may have left the queue; do not mark SQL as canceled
            # without knowing whether it could still execute.
            continue
        except Exception as exc:
            raise HTTPException(503, "Could not contact the processing queue.") from exc
        job.status = "canceled"
        job.current_stage = "canceled"
        job.error_message = None
        sample.processing_status = "canceled"
        sample.updated_at = _now()
        cancelled += 1
    db.commit()
    return {"canceled": cancelled}


@app.post("/api/batches/{batch_id}/samples/delete")
def delete_selected_samples(
    batch_id: str, payload: SampleDeleteRequest, db: Session = Depends(get_db)
) -> dict[str, int]:
    """Remove selected inactive sample records after explicit UI confirmation."""
    if db.get(Batch, batch_id) is None:
        raise HTTPException(404, "Batch not found.")
    ids = list(dict.fromkeys(payload.sample_ids))
    samples = db.scalars(
        select(Sample).where(Sample.batch_id == batch_id, Sample.id.in_(ids))
        .with_for_update()
    ).all()
    if len(samples) != len(ids):
        raise HTTPException(404, "One or more samples are not in the selected batch.")
    jobs = db.scalars(select(ProcessingJob).where(ProcessingJob.sample_id.in_(ids))).all()
    if any(s.processing_status == "processing" for s in samples) or any(
        job.status in {"queued", "processing"} for job in jobs
    ):
        raise HTTPException(409, "Cannot remove samples with active analysis jobs.")
    media = db.scalars(select(SampleMedia).where(SampleMedia.sample_id.in_(ids))).all()
    fields = db.scalars(select(SampleField).where(SampleField.sample_id.in_(ids))).all()
    for record in fields:
        db.delete(record)
    for record in media:
        db.delete(record)
    for record in jobs:
        db.delete(record)
    for record in samples:
        db.delete(record)
    db.commit()
    root = Path(settings.media_root).resolve()
    for sid in ids:
        folder = (root / sid).resolve()
        if folder.parent == root and folder.is_dir():
            try:
                rmtree(folder)
            except OSError:
                logger.exception("Could not clean saved media for deleted sample %s", sid)
    return {"deleted": len(ids)}


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
    except Exception:  # noqa: BLE001 - rollback must also cover unexpected I/O failures
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
    except Exception:  # noqa: BLE001 - queue failures must restore consistent database state
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


@app.post("/api/samples/{sample_id}/verify", response_model=SampleOut)
def verify_sample(sample_id: str, db: Session = Depends(get_db)) -> SampleOut:
    """A reviewer confirms the complete sample after checking source evidence."""
    sample = db.get(Sample, sample_id)
    if sample is None:
        raise HTTPException(404, "Sample not found.")
    if sample.processing_status != "completed":
        raise HTTPException(409, "Only completed samples can be verified.")
    sample.review_status = "verified"
    sample.updated_at = _now()
    db.commit()
    return sample_out(db, sample)


@app.post("/api/samples/{sample_id}/reopen", response_model=SampleOut)
def reopen_sample(sample_id: str, db: Session = Depends(get_db)) -> SampleOut:
    sample = db.get(Sample, sample_id)
    if sample is None:
        raise HTTPException(404, "Sample not found.")
    if sample.processing_status != "completed":
        raise HTTPException(409, "Only completed samples can be reopened.")
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
