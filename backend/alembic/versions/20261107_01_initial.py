"""Create batch, sample, media, review-field, and job tables.

Revision ID: 20261107_01
Revises:
"""
from alembic import op
import sqlalchemy as sa

revision = "20261107_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "batches",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("receiving_date", sa.String(10), nullable=False),
        sa.Column("default_export_filename", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "samples",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("batch_id", sa.String(36), sa.ForeignKey("batches.id"), nullable=False),
        sa.Column("external_sample_id", sa.String(100), nullable=True),
        sa.Column("label_type", sa.String(20), nullable=False),
        sa.Column("processing_status", sa.String(20), nullable=False),
        sa.Column("review_status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_samples_batch_id", "samples", ["batch_id"])
    op.create_table(
        "sample_fields",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("sample_id", sa.String(36), sa.ForeignKey("samples.id"), nullable=False),
        sa.Column("field_key", sa.String(40), nullable=False),
        sa.Column("predicted_value", sa.Text(), nullable=True),
        sa.Column("current_value", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("confidence_source", sa.String(60), nullable=True),
        sa.Column("status", sa.String(25), nullable=False),
        sa.Column("review_required", sa.Boolean(), nullable=False),
        sa.Column("reviewed", sa.Boolean(), nullable=False),
        sa.Column("review_reason", sa.Text(), nullable=True),
        sa.UniqueConstraint("sample_id", "field_key", name="uq_sample_field"),
    )
    op.create_index("ix_sample_fields_sample_id", "sample_fields", ["sample_id"])
    op.create_table(
        "sample_media",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("sample_id", sa.String(36), sa.ForeignKey("samples.id"), nullable=False),
        sa.Column("media_type", sa.String(20), nullable=False),
        sa.Column("mime_type", sa.String(60), nullable=False),
        sa.Column("relative_path", sa.Text(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
    )
    op.create_index("ix_sample_media_sample_id", "sample_media", ["sample_id"])
    op.create_table(
        "processing_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("sample_id", sa.String(36), sa.ForeignKey("samples.id"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("current_stage", sa.String(60), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_processing_jobs_sample_id", "processing_jobs", ["sample_id"])


def downgrade() -> None:
    op.drop_table("processing_jobs")
    op.drop_table("sample_media")
    op.drop_table("sample_fields")
    op.drop_table("samples")
    op.drop_table("batches")
