"""Public API shapes and deliberately simple Gemini-facing extraction schema."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


FIELD_KEYS = (
    "sample_id",
    "date_sampled",
    "date_received",
    "machine",
    "component",
    "serial_number",
    "reference_lube",
)


class BatchCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    receiving_date: date
    default_export_filename: str = Field(default="mrg-samples.csv", min_length=5, max_length=255)


class BatchOut(BaseModel):
    id: str
    name: str
    receiving_date: str
    default_export_filename: str
    created_at: datetime
    updated_at: datetime


class BatchSampleStatusOut(BaseModel):
    id: str
    status: str


class BatchStatusOut(BaseModel):
    total: int
    queued: int
    processing: int
    completed: int
    failed: int
    canceled: int = 0
    needs_review: int
    items: list[BatchSampleStatusOut]


class FieldOut(BaseModel):
    id: str
    field_key: str
    predicted_value: str | None
    current_value: str | None
    confidence: float | None
    confidence_source: str | None
    status: str
    review_required: bool
    reviewed: bool
    review_reason: str | None


class MediaOut(BaseModel):
    id: str
    media_type: Literal["video", "keyframe"]
    mime_type: str
    metadata_json: dict


class JobOut(BaseModel):
    status: str
    current_stage: str
    error_message: str | None


class SampleOut(BaseModel):
    id: str
    batch_id: str
    external_sample_id: str | None
    label_type: str
    processing_status: str
    review_status: str
    ai_confidence: Literal["high", "medium", "low"] | None
    ai_confidence_reason: str | None
    created_at: datetime
    updated_at: datetime
    fields: list[FieldOut]
    media: list[MediaOut]
    latest_job: JobOut | None


class InventoryOut(BaseModel):
    total: int
    items: list[SampleOut]


class SampleDeleteRequest(BaseModel):
    sample_ids: list[str] = Field(min_length=1, max_length=100)


class FieldCorrection(BaseModel):
    current_value: str = Field(max_length=5000)


class CompactExtraction(BaseModel):
    """Gemini returns literal readings, not guessed numerical confidence."""

    model_config = ConfigDict(extra="forbid")

    label_type: Literal["small", "large", "unknown"]
    sample_id: str | None
    date_sampled: str | None
    machine: str | None
    component: str | None
    serial_number: str | None
    reference_lube: str | None
    uncertain_fields: list[str]
    unreadable_fields: list[str]
    overall_confidence: Literal["high", "medium", "low"]
    confidence_reason: str


class SelectiveExportRequest(BaseModel):
    sample_ids: list[str] = Field(min_length=1, max_length=1000)
    verified_only: bool = False
