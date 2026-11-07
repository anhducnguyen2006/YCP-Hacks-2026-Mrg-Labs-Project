"""Persist subjective model-reported overall confidence per extracted sample.

Revision ID: 20261107_02
Revises: 20261107_01
"""
from alembic import op
import sqlalchemy as sa

revision = "20261107_02"
down_revision = "20261107_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("samples", sa.Column("ai_confidence", sa.String(12), nullable=True))
    op.add_column("samples", sa.Column("ai_confidence_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("samples", "ai_confidence_reason")
    op.drop_column("samples", "ai_confidence")
