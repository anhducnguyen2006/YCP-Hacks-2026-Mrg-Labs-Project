import re
import uuid
from pathlib import Path

from fastapi import UploadFile

SAFE_MIME_TYPES = {"video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm"}


def safe_video_path(root: Path, mime_type: str) -> Path:
    extension = SAFE_MIME_TYPES.get(mime_type)
    if extension is None:
        raise ValueError("Unsupported video MIME type. Use MP4, MOV, or WebM.")
    root.mkdir(parents=True, exist_ok=True)
    return root / f"{uuid.uuid4().hex}{extension}"


async def save_upload(upload: UploadFile, destination: Path, max_bytes: int) -> int:
    total = 0
    with destination.open("wb") as target:
        while chunk := await upload.read(1024 * 1024):
            total += len(chunk)
            if total > max_bytes:
                destination.unlink(missing_ok=True)
                raise ValueError("Video exceeds the configured maximum size of 50 MB.")
            target.write(chunk)
    return total


def validate_filename(filename: str | None) -> str:
    if not filename or not re.search(r"\.(mp4|mov|webm)$", filename, re.IGNORECASE):
        raise ValueError("Unsupported video extension. Use MP4, MOV, or WebM.")
    return filename
