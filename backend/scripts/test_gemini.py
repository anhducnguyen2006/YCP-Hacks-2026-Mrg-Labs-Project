"""Explicit, isolated Gemini diagnostics.

Examples:
  python scripts/test_gemini.py models
  python scripts/test_gemini.py text
  python scripts/test_gemini.py image /path/to/frame.jpg
  python scripts/test_gemini.py frames /path/to/sample.MOV
  python scripts/test_gemini.py video /path/to/sample.MOV
"""

import argparse
import logging
import os
import sys
import tempfile
import time
from pathlib import Path

from google import genai
from google.genai import errors, types

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("test_gemini")


def client() -> tuple[genai.Client, str]:
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise SystemExit("GEMINI_API_KEY is not configured.")
    return (
        genai.Client(
            api_key=key,
            http_options=types.HttpOptions(
                timeout=120_000,
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        ),
        os.getenv("GEMINI_MODEL", "gemini-3.8-flash"),
    )


def safe_error(exc: Exception) -> str:
    code = getattr(exc, "code", "unknown")
    status = getattr(exc, "status", "unknown")
    message = str(getattr(exc, "message", exc)).replace("\n", " ")
    return f"code={code} status={status} message={message[:300]}"


def models() -> int:
    api, configured = client()
    logger.info("configured_model=%s api_method=models.list", configured)
    for model in api.models.list(config={"page_size": 100}):
        actions = getattr(model, "supported_actions", []) or []
        if "generateContent" in actions:
            name = getattr(model, "name", "")
            lifecycle = "preview" if "preview" in name else "non-preview/unspecified"
            logger.info("model=%s lifecycle=%s supports=%s", name, lifecycle, ",".join(actions))
    return 0


def text() -> int:
    api, model = client()
    started = time.monotonic()
    try:
        response = api.models.generate_content(model=model, contents="Reply with exactly: GEMINI_TEXT_OK")
        logger.info("model=%s api_method=generate_content response_status=success duration_ms=%s text=%r", model, round((time.monotonic() - started) * 1000), response.text)
        return 0
    except (errors.APIError, OSError) as exc:
        logger.error("model=%s api_method=generate_content response_status=error duration_ms=%s %s", model, round((time.monotonic() - started) * 1000), safe_error(exc))
        return 1


def video(path: Path) -> int:
    api, model = client()
    started = time.monotonic()
    uploaded = None
    try:
        uploaded = api.files.upload(file=path)
        logger.info("model=%s api_method=files.upload upload_status=%s", model, getattr(getattr(uploaded, "state", None), "name", "unknown"))
        deadline = time.monotonic() + 120
        while getattr(getattr(uploaded, "state", None), "name", "") == "PROCESSING":
            if time.monotonic() >= deadline:
                raise TimeoutError("video processing timed out")
            time.sleep(2)
            uploaded = api.files.get(name=uploaded.name)
        state = getattr(getattr(uploaded, "state", None), "name", "unknown")
        logger.info("model=%s api_method=files.get file_status=%s", model, state)
        if state != "ACTIVE":
            raise RuntimeError(f"uploaded file state is {state}")
        response = api.models.generate_content(
            model=model,
            contents=[types.Part.from_uri(file_uri=uploaded.uri, mime_type=uploaded.mime_type), "Describe this video in one sentence."],
        )
        logger.info("model=%s api_method=generate_content response_status=success duration_ms=%s text=%r", model, round((time.monotonic() - started) * 1000), response.text)
        return 0
    except (errors.APIError, OSError, RuntimeError, TimeoutError) as exc:
        logger.error("model=%s api_method=video_inference response_status=error duration_ms=%s %s", model, round((time.monotonic() - started) * 1000), safe_error(exc))
        return 1
    finally:
        if uploaded is not None:
            try:
                api.files.delete(name=uploaded.name)
            except (errors.APIError, OSError):
                logger.warning("temporary Gemini file cleanup failed")


def image(path: Path) -> int:
    api, model = client()
    started = time.monotonic()
    try:
        response = api.models.generate_content(
            model=model,
            contents=[
                types.Part.from_bytes(
                    data=path.read_bytes(),
                    mime_type="image/jpeg",
                    media_resolution=types.PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH,
                ),
                "Describe the visible writing on this sample label. Do not guess unreadable text.",
            ],
        )
        logger.info("model=%s api_method=generate_content image_status=success duration_ms=%s text=%r", model, round((time.monotonic() - started) * 1000), response.text)
        return 0
    except (errors.APIError, OSError) as exc:
        logger.error("model=%s api_method=generate_content image_status=error duration_ms=%s %s", model, round((time.monotonic() - started) * 1000), safe_error(exc))
        return 1


def frames(path: Path) -> int:
    from app.media import extract_frames

    api, model = client()
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="gemini-diagnostic-") as directory:
        frame_paths = extract_frames(path, Path(directory), frame_fps=6, max_frames=12)
        try:
            response = api.models.generate_content(
                model=model,
                contents=[
                    *[
                        types.Part.from_bytes(
                            data=frame.read_bytes(),
                            mime_type="image/jpeg",
                            media_resolution=types.PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH,
                        )
                        for frame in frame_paths
                    ],
                    "These chronological images show different views of the same sample tube. Describe the visible writing, combining information across images.",
                ],
            )
            logger.info("model=%s api_method=generate_content frames=%s frames_status=success duration_ms=%s text=%r", model, len(frame_paths), round((time.monotonic() - started) * 1000), response.text)
            return 0
        except (errors.APIError, OSError) as exc:
            logger.error("model=%s api_method=generate_content frames=%s frames_status=error duration_ms=%s %s", model, len(frame_paths), round((time.monotonic() - started) * 1000), safe_error(exc))
            return 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("models", "text", "image", "frames", "video"))
    parser.add_argument("path", nargs="?", type=Path)
    args = parser.parse_args()
    if args.mode == "models":
        return models()
    if args.mode == "text":
        return text()
    if args.path is None or not args.path.is_file():
        parser.error(f"{args.mode} mode requires an existing path")
    if args.mode == "image":
        return image(args.path)
    if args.mode == "frames":
        return frames(args.path)
    return video(args.path)


if __name__ == "__main__":
    sys.exit(main())
