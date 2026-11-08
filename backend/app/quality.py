"""Batch-wide non-destructive quality alerts for visually transcribed sample fields.

Flags are invitations to inspect the original label, never automatic corrections.
"""
from collections import Counter
from datetime import date
from math import ceil
from statistics import median

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Sample, SampleField

APPLICABLE = ("sample_id", "date_sampled", "machine", "component",
              "serial_number", "reference_lube")
REQUIRED = {"sample_id", "date_sampled", "machine", "component"}
OCR_SCORE_THRESHOLD = 0.90


def batch_quality(db: Session, batch_id: str) -> dict:
    samples = db.scalars(
        select(Sample).where(Sample.batch_id == batch_id,
                             Sample.processing_status == "completed")
    ).all()
    ids = [sample.id for sample in samples]
    by_id: dict[str, dict[str, SampleField]] = {sid: {} for sid in ids}
    if ids:
        for field in db.scalars(
            select(SampleField).where(SampleField.sample_id.in_(ids))
        ):
            by_id[field.sample_id][field.field_key] = field

    years = []
    for sample in samples:
        field = by_id[sample.id].get("date_sampled")
        if field and field.current_value:
            try:
                years.append(date.fromisoformat(field.current_value).year)
            except ValueError:
                pass

    # Only create consensus when there is enough agreeing evidence in this
    # batch; no inference from batch receiving date or unverified AI confidence.
    consensus = None
    if len(years) >= 3:
        year = int(median(years))
        supporting = Counter(years)[year]
        if supporting >= max(3, ceil(len(years) * 0.6)):
            consensus = year

    results: dict[str, list[dict[str, str]]] = {}
    for sample in samples:
        fields = by_id[sample.id]
        alerts: list[dict[str, str]] = []
        for key in APPLICABLE:
            if sample.label_type == "small" and key == "reference_lube":
                continue
            if sample.label_type == "large" and key == "serial_number":
                continue
            field = fields.get(key)
            if field is None:
                # Legacy records may not have any structured extraction for this field.
                continue
            if field.status == "not_applicable":
                continue
            value = (field.current_value or "").strip()
            if field.status == "unreadable" and not value:
                alerts.append({"field_key": key, "code": "unreadable",
                               "message": "AI could not read this field. Inspect the original label."})
            elif not value:
                # Empty optional fields are normal; do not claim to see handwriting.
                if key in REQUIRED and not field.reviewed:
                    alerts.append({
                        "field_key": key, "code": "missing_required",
                        "message": "No value extracted for a required field; inspect the label.",
                    })
                continue
            elif key == "date_sampled":
                try:
                    year = date.fromisoformat(value).year
                except ValueError:
                    alerts.append({"field_key": key, "code": "invalid_date",
                                   "message": "Date format is invalid; verify the handwritten date."})
                    continue
                if consensus is not None and abs(year - consensus) >= 2:
                    alerts.append({"field_key": key, "code": "year_outlier",
                                   "message": (f"Year {year} differs from batch consensus "
                                               f"{consensus}. Check the handwritten year.")})
            if (
                not field.reviewed
                and field.confidence_source in {"paddleocr_cpu", "paddleocr_gpu"}
                and field.confidence is not None
                and field.confidence < OCR_SCORE_THRESHOLD

            ):
                alerts.append({
                    "field_key": key, "code": "low_ocr_score",
                    "message": (f"OCR recognition score {field.confidence:.0%}; "
                                "check against the original label."),
                })
            elif (
                not field.reviewed
                and field.confidence_source in {"paddleocr_cpu", "paddleocr_gpu"}
                and field.confidence is None
                and field.current_value
            ):
                alerts.append({
                    "field_key": key, "code": "unknown_ocr_score",
                    "message": "OCR recognition score unavailable; verify this field.",
                })
        if alerts:
            results[sample.id] = alerts
    return {"consensus_year": consensus, "scanned": len(samples), "flags": results}
