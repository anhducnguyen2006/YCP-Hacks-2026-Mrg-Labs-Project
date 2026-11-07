"""Track the RQ job associated with a processing job."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261107_03"
down_revision: Union[str, None] = "20261107_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("processing_jobs", sa.Column("rq_job_id", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("processing_jobs", "rq_job_id")
