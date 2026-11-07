from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

FIELD_KEYS = ("sample_id", "date_sampled", "date_received", "machine", "component", "serial_number", "reference_lube")


class BatchCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    receiving_date: date
    default_export_filename: str = Field(default="mrg-samples.csv", min_length=1, max_length=255)


class BatchUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    receiving_date: date | None = None
    default_export_filename: str | None = Field(default=None, min_length=1, max_length=255)


class BatchRead(BatchCreate):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime


class SampleFieldRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    field_key: str
    predicted_value: str | None
    current_value: str | None
    confidence: float | None
    confidence_source: str | None
    status: str
    review_required: bool
    reviewed: bool
    review_reason: str | None


class SampleFieldUpdate(BaseModel):
    current_value: str | None = None


class SampleMediaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    media_type: str
    mime_type: str
    metadata_json: dict


class ProcessingJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: str
    current_stage: str
    error_message: str | None
    model_used: str | None
    rq_job_id: str | None
    retry_count: int
    queued_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class SampleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    batch_id: UUID
    external_sample_id: str | None
    label_type: str
    processing_status: str
    review_status: str
    created_at: datetime
    updated_at: datetime
    fields: list[SampleFieldRead]
    media: list[SampleMediaRead]
    latest_job: ProcessingJobRead | None = None


class ExtractionField(BaseModel):
    value: str | None = None
    status: Literal["extracted", "unreadable", "missing", "not_applicable"] = "missing"
    uncertain: bool = False
    reason: str | None = None
    confidence: float | None = None


class ExtractionFields(BaseModel):
    sample_id: ExtractionField = ExtractionField()
    date_sampled: ExtractionField = ExtractionField()
    date_received: ExtractionField = ExtractionField()
    machine: ExtractionField = ExtractionField()
    component: ExtractionField = ExtractionField()
    serial_number: ExtractionField = ExtractionField()
    reference_lube: ExtractionField = ExtractionField()


class ExtractionResponse(BaseModel):
    label_type: Literal["large", "small", "unknown"]
    fields: ExtractionFields
