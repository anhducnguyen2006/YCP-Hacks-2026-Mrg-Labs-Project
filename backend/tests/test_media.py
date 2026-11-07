import json
import subprocess
from pathlib import Path

import pytest

from app import media


def test_extract_frames_samples_short_video_and_preserves_order(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    probe = {"format": {"duration": "1.735", "format_name": "mov"}}
    monkeypatch.setattr(
        media.subprocess,
        "run",
        lambda command, **kwargs: _fake_ffmpeg(command, kwargs, probe),
    )

    frames = media.extract_frames(tmp_path / "sample.MOV", tmp_path / "frames", 6, 12)

    assert [frame.name for frame in frames] == ["frame-001.jpg", "frame-002.jpg", "frame-003.jpg"]


def test_extract_frames_rejects_empty_ffmpeg_output(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    probe = {"format": {"duration": "2", "format_name": "mov"}}
    monkeypatch.setattr(
        media.subprocess,
        "run",
        lambda command, **kwargs: _fake_ffmpeg(command, kwargs, probe, write_frames=False),
    )

    with pytest.raises(ValueError, match="did not produce"):
        media.extract_frames(tmp_path / "sample.MOV", tmp_path / "frames")


def _fake_ffmpeg(
    command: list[str], kwargs: dict, probe: dict, write_frames: bool = True
) -> subprocess.CompletedProcess[str]:
    if "ffprobe" in command[0]:
        return subprocess.CompletedProcess(command, 0, json.dumps(probe), "")
    if write_frames:
        output_pattern = Path(command[-1])
        output_pattern.parent.mkdir(parents=True, exist_ok=True)
        for index in range(1, 4):
            output_pattern.parent.joinpath(f"frame-{index:03d}.jpg").write_bytes(b"jpeg")
    return subprocess.CompletedProcess(command, 0, "", "")
