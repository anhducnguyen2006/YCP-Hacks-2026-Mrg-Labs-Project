"""Create sample scanning domain tables.

Revision ID: 20261106_01
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261106_01"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    uuid_type = sa.UUID()
    timestamp = sa.DateTime(timezone=True)
    op.create_table(
        "batches",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("receiving_date", sa.Date(), nullable=False),
        sa.Column("default_export_filename", sa.String(255), nullable=False),
        sa.Column("created_at", timestamp, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", timestamp, server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "samples",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("batch_id", uuid_type, sa.ForeignKey("batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("external_sample_id", sa.String(255)),
        sa.Column("label_type", sa.String(20), nullable=False),
        sa.Column("processing_status", sa.String(20), nullable=False),
        sa.Column("review_status", sa.String(20), nullable=False),
        sa.Column("created_at", timestamp, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", timestamp, server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_samples_batch_id", "samples", ["batch_id"])
    op.create_index("ix_samples_batch_id_created_at", "samples", ["batch_id", "created_at"])
    op.create_table(
        "sample_fields",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("sample_id", uuid_type, sa.ForeignKey("samples.id", ondelete="CASCADE"), nullable=False),
        sa.Column("field_key", sa.String(50), nullable=False),
        sa.Column("predicted_value", sa.Text()),
        sa.Column("current_value", sa.Text()),
        sa.Column("confidence", sa.Float()),
        sa.Column("confidence_source", sa.String(100)),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("review_required", sa.Boolean(), nullable=False),
        sa.Column("reviewed", sa.Boolean(), nullable=False),
        sa.Column("review_reason", sa.Text()),
    )
    op.create_index("ix_sample_fields_sample_id", "sample_fields", ["sample_id"])
    op.create_index("ix_sample_fields_sample_id_field_key", "sample_fields", ["sample_id", "field_key"], unique=True)
    op.create_table(
        "sample_media",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("sample_id", uuid_type, sa.ForeignKey("samples.id", ondelete="CASCADE"), nullable=False),
        sa.Column("media_type", sa.String(20), nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", timestamp, server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_sample_media_sample_id", "sample_media", ["sample_id"])
    op.create_table(
        "processing_jobs",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("sample_id", uuid_type, sa.ForeignKey("samples.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("current_stage", sa.String(50), nullable=False),
        sa.Column("error_message", sa.Text()),
        sa.Column("retry_count", sa.Integer(), nullable=False),
        sa.Column("queued_at", timestamp, server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", timestamp),
        sa.Column("completed_at", timestamp),
    )
    op.create_index("ix_processing_jobs_sample_id", "processing_jobs", ["sample_id"])


def downgrade() -> None:
    op.drop_table("processing_jobs")
    op.drop_table("sample_media")
    op.drop_index("ix_sample_fields_sample_id_field_key", table_name="sample_fields")
    op.drop_index("ix_sample_fields_sample_id", table_name="sample_fields")
    op.drop_table("sample_fields")
    op.drop_index("ix_samples_batch_id_created_at", table_name="samples")
    op.drop_index("ix_samples_batch_id", table_name="samples")
    op.drop_table("samples")
    op.drop_table("batches")
