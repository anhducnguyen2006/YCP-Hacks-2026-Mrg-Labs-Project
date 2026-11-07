import json
import logging
import random
import time
from pathlib import Path
from typing import Any

import httpx
from google.genai import errors

from app.config import get_settings
from app.schemas import ExtractionResponse

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """Analyze this rotating MRG laboratory sample label video. Identify whether the label is large or small.
Return JSON matching the provided schema. Read only information visible in the video; never guess.
For small labels, report only the physically circled number and circled GS/NGS in component.
Do not provide date_received; the backend supplies it from the batch. Use not_applicable for fields that do not apply.
Canonical fields: sample_id, date_sampled, machine, component, serial_number, reference_lube."""
FRAME_EXTRACTION_PROMPT = """These chronological images show different rotational views of the SAME MRG laboratory sample tube.
Combine information across all images; do not create a separate sample for each image, and do not assume information missing
from one view is absent from the label. Preserve exact identifiers and leading zeros. Identify physically circled options.
Do not guess unreadable handwriting. Report uncertainty explicitly.
Identify whether the label is large or small and return JSON matching the provided schema.
Do not provide date_received; the backend supplies it from the batch."""
IMAGE_DESCRIPTION_PROMPT = "Describe the visible writing on this sample label. Do not guess unreadable text."


class TransientGeminiError(RuntimeError):
    def __init__(self, cause: Exception, attempts: int) -> None:
        super().__init__(str(cause))
        self.cause = cause
        self.attempts = attempts


class GeminiExtractionService:
    def __init__(self) -> None:
        settings = get_settings()
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured.")
        from google import genai
        from google.genai import types

        self.client = genai.Client(
            api_key=settings.gemini_api_key,
            http_options=types.HttpOptions(
                timeout=120_000,
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        )
        self.model = settings.gemini_model
        self.fallback_model = settings.gemini_fallback_model
        self.input_mode = settings.gemini_input_mode
        self.model_used: str | None = None
        self.video_fps = float(settings.gemini_video_fps) if settings.gemini_video_fps else None
        self.max_attempts = max(1, settings.gemini_max_attempts)
        self.max_retry_wait_seconds = max(0, settings.gemini_max_retry_wait_seconds)
        self.frame_fps = settings.gemini_frame_fps
        self.max_frames = settings.gemini_max_frames

    def extract(self, path: Path) -> ExtractionResponse:
        if self.input_mode == "frames":
            return self.extract_frames(path)
        if self.input_mode == "auto":
            try:
                return self._extract_video(path, self.max_attempts)
            except TransientGeminiError as exc:
                remaining = self.max_attempts - exc.attempts
                if remaining <= 0:
                    raise
                logger.warning("[GEMINI] direct_video_failed falling_back_to_frames remaining_attempts=%s", remaining)
                return self.extract_frames(path, attempt_budget=remaining)
        if self.input_mode != "video":
            raise ValueError("GEMINI_INPUT_MODE must be video, frames, or auto.")
        return self._extract_video(path, self.max_attempts)

    def _extract_video(self, path: Path, attempt_budget: int) -> ExtractionResponse:
        from google.genai import types

        logger.info("[GEMINI] upload_started file=%s", path.name)
        uploaded = self.client.files.upload(file=path)
        try:
            deadline = time.monotonic() + 120
            while getattr(uploaded, "state", None) and getattr(uploaded.state, "name", "") == "PROCESSING":
                if time.monotonic() >= deadline:
                    raise TimeoutError("Gemini video processing timed out.")
                time.sleep(2)
                uploaded = self.client.files.get(name=uploaded.name)
            logger.info("[GEMINI] file_active name=%s", uploaded.name)
            if getattr(uploaded, "state", None) and getattr(uploaded.state, "name", "") == "FAILED":
                raise RuntimeError("Gemini could not process the uploaded video.")
            video_part = types.Part.from_uri(file_uri=uploaded.uri, mime_type=uploaded.mime_type)
            if self.video_fps is not None:
                video_part = types.Part(
                    fileData=types.FileData(fileUri=uploaded.uri, mimeType=uploaded.mime_type),
                    videoMetadata=types.VideoMetadata(fps=self.video_fps),
                )
            response = self._generate_with_retry(
                [video_part, EXTRACTION_PROMPT],
                types,
                attempt_budget,
            )
            raw = response.text
            if not raw:
                raise ValueError("Gemini returned an empty extraction response.")
            data: Any = json.loads(raw)
            parsed = ExtractionResponse.model_validate(data)
            logger.info("[PARSE] structured_output_valid=true model=%s", self.model)
            return parsed
        finally:
            try:
                self.client.files.delete(name=uploaded.name)
            except (OSError, ValueError, errors.APIError, httpx.HTTPError) as exc:
                logger.warning("Unable to delete temporary Gemini upload %s: %s", uploaded.name, exc)

    def extract_frames(self, path: Path, attempt_budget: int | None = None) -> ExtractionResponse:
        from tempfile import TemporaryDirectory

        from google.genai import types

        from app.media import extract_frames as extract_video_frames

        with TemporaryDirectory(prefix="mrg-frames-") as directory:
            frame_paths = extract_video_frames(Path(path), Path(directory), self.frame_fps, self.max_frames)
            logger.info("[FRAMES] extracted count=%s first=%s", len(frame_paths), frame_paths[0].name)
            contents = [
                types.Part.from_bytes(
                    data=frame.read_bytes(),
                    mime_type="image/jpeg",
                    media_resolution=types.PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH,
                )
                for frame in frame_paths
            ]
            response = self._generate_with_retry(
                contents + [FRAME_EXTRACTION_PROMPT],
                types,
                attempt_budget or self.max_attempts,
            )
            raw = response.text
            if not raw:
                raise ValueError("Gemini returned an empty extraction response.")
            parsed = ExtractionResponse.model_validate(json.loads(raw))
            self.model_used = self.model_used or self.model
            logger.info("[PARSE] structured_output_valid=true model=%s input=frames", self.model)
            return parsed

    def describe_image(self, path: Path) -> str:
        from google.genai import types

        response = self.client.models.generate_content(
            model=self.model,
            contents=[
                types.Part.from_bytes(
                    data=path.read_bytes(),
                    mime_type="image/jpeg",
                    media_resolution=types.PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH,
                ),
                IMAGE_DESCRIPTION_PROMPT,
            ],
        )
        return response.text or ""

    def _generate_with_retry(self, contents: list[Any], types: Any, attempt_budget: int) -> Any:
        models = [self.model]
        if self.fallback_model and self.fallback_model != self.model:
            models.append(self.fallback_model)
        last_error: Exception | None = None
        attempt = 0
        for model_index, model in enumerate(models):
            if model_index > 0 and not self._supports_generation(model):
                raise RuntimeError(f"Configured fallback model {model} does not support generateContent.")
            model_budget = attempt_budget
            if model_index == 0 and len(models) > 1:
                model_budget = max(1, attempt_budget - 1)
            for _ in range(model_budget):
                attempt += 1
                started = time.monotonic()
                try:
                    logger.info("[GEMINI] inference_started model=%s attempt=%s/%s", model, attempt, self.max_attempts)
                    response = self.client.models.generate_content(
                        model=model,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            response_schema=ExtractionResponse.model_json_schema(),
                        ),
                    )
                    self.model = model
                    self.model_used = model
                    logger.info("[GEMINI] inference_succeeded model=%s duration_ms=%s", model, round((time.monotonic() - started) * 1000))
                    return response
                except (errors.APIError, httpx.HTTPError, OSError) as exc:
                    last_error = exc
                    code = getattr(exc, "code", None)
                    if not self._is_transient(code) or attempt >= attempt_budget:
                        raise
                    delay = min(self.max_retry_wait_seconds, 2 ** (attempt - 1) + random.uniform(0, 1))
                    retry_after = self._retry_after_seconds(exc)
                    if retry_after is not None:
                        delay = min(self.max_retry_wait_seconds, max(delay, retry_after))
                    logger.warning("[GEMINI] transient_failure model=%s code=%s attempt=%s/%s retry_in=%.1fs", model, code, attempt, self.max_attempts, delay)
                    time.sleep(delay)
        if last_error is not None:
            raise TransientGeminiError(last_error, attempt)
        raise RuntimeError("Gemini inference did not run.")

    @staticmethod
    def _is_transient(code: Any) -> bool:
        return code in {429, 500, 502, 503, 504}

    def _supports_generation(self, model: str) -> bool:
        metadata = self.client.models.get(model=model)
        return "generateContent" in (getattr(metadata, "supported_actions", None) or [])

    @staticmethod
    def _retry_after_seconds(exc: Exception) -> float | None:
        response = getattr(exc, "response", None)
        headers = getattr(response, "headers", None) or getattr(exc, "headers", None)
        if not headers:
            return None
        try:
            return max(0, float(headers.get("Retry-After")))
        except (AttributeError, TypeError, ValueError):
            return None
