"""Persisted laboratory batches, videos, processing jobs, and human-reviewed fields."""
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def uid() -> str:
    return str(uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


class Batch(Base):
    __tablename__ = "batches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(200))
    receiving_date: Mapped[str] = mapped_column(String(10))
    default_export_filename: Mapped[str] = mapped_column(String(255), default="mrg-samples.csv")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Sample(Base):
    __tablename__ = "samples"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    batch_id: Mapped[str] = mapped_column(String(36), ForeignKey("batches.id"), index=True)
    external_sample_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    label_type: Mapped[str] = mapped_column(String(20), default="unknown")
    processing_status: Mapped[str] = mapped_column(String(20), default="queued")
    review_status: Mapped[str] = mapped_column(String(20), default="pending")
    ai_confidence: Mapped[str | None] = mapped_column(String(12), nullable=True)
    ai_confidence_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SampleField(Base):
    __tablename__ = "sample_fields"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    sample_id: Mapped[str] = mapped_column(String(36), ForeignKey("samples.id"), index=True)
    field_key: Mapped[str] = mapped_column(String(40))
    predicted_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence_source: Mapped[str | None] = mapped_column(String(60), nullable=True)
    status: Mapped[str] = mapped_column(String(25), default="missing")
    review_required: Mapped[bool] = mapped_column(Boolean, default=True)
    reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
    review_reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class SampleMedia(Base):
    __tablename__ = "sample_media"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    sample_id: Mapped[str] = mapped_column(String(36), ForeignKey("samples.id"), index=True)
    media_type: Mapped[str] = mapped_column(String(20))
    mime_type: Mapped[str] = mapped_column(String(60))
    relative_path: Mapped[str] = mapped_column(Text)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    sample_id: Mapped[str] = mapped_column(String(36), ForeignKey("samples.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="queued")
    current_stage: Mapped[str] = mapped_column(String(60), default="queued")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
