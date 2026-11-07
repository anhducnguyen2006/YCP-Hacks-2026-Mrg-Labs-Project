"""Record the Gemini model used for each processing job."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261107_02"
down_revision: Union[str, None] = "20261106_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("processing_jobs", sa.Column("model_used", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("processing_jobs", "model_used")
