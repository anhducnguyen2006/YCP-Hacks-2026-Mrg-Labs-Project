import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Index, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Batch(Base):
    __tablename__ = "batches"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    receiving_date: Mapped[date] = mapped_column(Date)
    default_export_filename: Mapped[str] = mapped_column(String(255), default="mrg-samples.csv")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    samples: Mapped[list["Sample"]] = relationship(back_populates="batch", cascade="all, delete-orphan")


class Sample(Base):
    __tablename__ = "samples"
    __table_args__ = (Index("ix_samples_batch_id_created_at", "batch_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("batches.id", ondelete="CASCADE"), index=True)
    external_sample_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    label_type: Mapped[str] = mapped_column(String(20), default="unknown")
    processing_status: Mapped[str] = mapped_column(String(20), default="queued")
    review_status: Mapped[str] = mapped_column(String(20), default="not_required")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    batch: Mapped[Batch] = relationship(back_populates="samples")
    fields: Mapped[list["SampleField"]] = relationship(back_populates="sample", cascade="all, delete-orphan")
    media: Mapped[list["SampleMedia"]] = relationship(back_populates="sample", cascade="all, delete-orphan")
    jobs: Mapped[list["ProcessingJob"]] = relationship(back_populates="sample", cascade="all, delete-orphan")


class SampleField(Base):
    __tablename__ = "sample_fields"
    __table_args__ = (Index("ix_sample_fields_sample_id_field_key", "sample_id", "field_key", unique=True),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    sample_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("samples.id", ondelete="CASCADE"), index=True)
    field_key: Mapped[str] = mapped_column(String(50))
    predicted_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(nullable=True)
    confidence_source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="missing")
    review_required: Mapped[bool] = mapped_column(default=False)
    reviewed: Mapped[bool] = mapped_column(default=False)
    review_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    sample: Mapped[Sample] = relationship(back_populates="fields")


class SampleMedia(Base):
    __tablename__ = "sample_media"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    sample_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("samples.id", ondelete="CASCADE"), index=True)
    media_type: Mapped[str] = mapped_column(String(20))
    storage_path: Mapped[str] = mapped_column(Text)
    mime_type: Mapped[str] = mapped_column(String(100))
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sample: Mapped[Sample] = relationship(back_populates="media")


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    sample_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("samples.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="queued")
    current_stage: Mapped[str] = mapped_column(String(50), default="queued")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_used: Mapped[str | None] = mapped_column(String(100), nullable=True)
    rq_job_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    queued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    sample: Mapped[Sample] = relationship(back_populates="jobs")
