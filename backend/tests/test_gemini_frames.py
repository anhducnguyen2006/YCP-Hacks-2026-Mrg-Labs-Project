from pathlib import Path
from types import SimpleNamespace

from app.gemini import GeminiExtractionService


def test_frame_parts_are_built_in_chronological_order(monkeypatch, tmp_path: Path) -> None:
    service = object.__new__(GeminiExtractionService)
    service.model = "gemini-3.8-flash"
    service.fallback_model = None
    service.max_attempts = 1
    service.max_retry_wait_seconds = 0
    service.model_used = None
    service.frame_fps = 6
    service.max_frames = 12

    frames = [tmp_path / "frame-001.jpg", tmp_path / "frame-002.jpg"]
    for index, frame in enumerate(frames):
        frame.write_bytes(f"frame-{index}".encode())

    captured: list = []
    monkeypatch.setattr(
        "app.gemini.extract_frames",
        lambda *args: frames,
        raising=False,
    )
    service._generate_with_retry = lambda contents, types, attempt_budget: captured.append(contents) or SimpleNamespace(
        text='{"label_type":"unknown","fields":{}}'
    )

    monkeypatch.setattr("app.media.extract_frames", lambda *args: frames)
    result = service.extract_frames(tmp_path / "video.MOV")

    assert result.label_type == "unknown"
    assert [part.inline_data.data for part in captured[0][:2]] == [b"frame-0", b"frame-1"]
