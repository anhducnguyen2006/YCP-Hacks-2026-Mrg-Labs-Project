import json
import logging
import time
from pathlib import Path
from typing import Any

from google.genai import errors

from app.config import get_settings
from app.schemas import ExtractionResponse

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """Analyze this rotating MRG laboratory sample label video. Identify whether the label is large or small.
Return JSON matching the provided schema. Read only information visible in the video; never guess.
For small labels, report only the physically circled number and circled GS/NGS in component.
Do not provide date_received; the backend supplies it from the batch. Use not_applicable for fields that do not apply.
Canonical fields: sample_id, date_sampled, machine, component, serial_number, reference_lube."""


class GeminiExtractionService:
    def __init__(self) -> None:
        settings = get_settings()
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured.")
        from google import genai

        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model = settings.gemini_model
        self.video_fps = float(settings.gemini_video_fps) if settings.gemini_video_fps else None

    def extract(self, path: Path) -> ExtractionResponse:
        from google.genai import types

        uploaded = self.client.files.upload(file=path)
        try:
            deadline = time.monotonic() + 120
            while getattr(uploaded, "state", None) and getattr(uploaded.state, "name", "") == "PROCESSING":
                if time.monotonic() >= deadline:
                    raise TimeoutError("Gemini video processing timed out.")
                time.sleep(2)
                uploaded = self.client.files.get(name=uploaded.name)
            if getattr(uploaded, "state", None) and getattr(uploaded.state, "name", "") == "FAILED":
                raise RuntimeError("Gemini could not process the uploaded video.")
            video_part = types.Part.from_uri(file_uri=uploaded.uri, mime_type=uploaded.mime_type)
            if self.video_fps is not None:
                video_part = types.Part(
                    fileData=types.FileData(fileUri=uploaded.uri, mimeType=uploaded.mime_type),
                    videoMetadata=types.VideoMetadata(fps=self.video_fps),
                )
            response = self.client.models.generate_content(
                model=self.model,
                contents=[
                    video_part,
                    EXTRACTION_PROMPT,
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=ExtractionResponse.model_json_schema(),
                ),
            )
            raw = response.text
            if not raw:
                raise ValueError("Gemini returned an empty extraction response.")
            data: Any = json.loads(raw)
            parsed = ExtractionResponse.model_validate(data)
            return parsed
        finally:
            try:
                self.client.files.delete(name=uploaded.name)
            except (OSError, ValueError, errors.APIError) as exc:
                logger.warning("Unable to delete temporary Gemini upload %s: %s", uploaded.name, exc)
