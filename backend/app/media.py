import json
import subprocess
from pathlib import Path


def inspect_video(path: Path, max_duration_seconds: int) -> dict[str, float | str]:
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration,format_name", "-of", "json", str(path)],
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        raise ValueError("Video inspection requires ffprobe and a readable video file.") from exc
    data = json.loads(result.stdout)
    format_data = data.get("format", {})
    format_name = str(format_data.get("format_name", ""))
    if not {"mp4", "mov", "webm", "matroska"}.intersection(format_name.split(",")):
        raise ValueError("Unsupported video codec/container. Use a browser-compatible MP4, MOV, or WebM video.")
    duration = float(format_data.get("duration", 0))
    if duration <= 0:
        raise ValueError("The uploaded video has no readable duration.")
    if duration > max_duration_seconds:
        raise ValueError(f"Video exceeds the configured maximum duration of {max_duration_seconds} seconds.")
    return {"duration": duration, "format_name": format_name}


def extract_keyframe(path: Path, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(path), "-vf", "thumbnail,scale=1280:-1", "-frames:v", "1", str(output_path)],
        capture_output=True,
        check=True,
    )


def extract_frames(
    path: Path,
    output_dir: Path,
    frame_fps: float = 6,
    max_frames: int = 12,
) -> list[Path]:
    metadata = inspect_video(path, max_duration_seconds=24 * 60 * 60)
    duration = float(metadata["duration"])
    output_dir.mkdir(parents=True, exist_ok=True)
    effective_fps = max(1.0, min(frame_fps, max_frames / max(duration, 0.1)))
    output_pattern = output_dir / "frame-%03d.jpg"
    vf = f"fps={effective_fps:.4f},scale='min(2048,iw)':-2"
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-autorotate",
                "-i",
                str(path),
                "-vf",
                vf,
                "-frames:v",
                str(max_frames),
                "-q:v",
                "2",
                str(output_pattern),
            ],
            capture_output=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        raise ValueError("Frame extraction requires ffmpeg and a readable video file.") from exc
    frames = sorted(output_dir.glob("frame-*.jpg"))
    if not frames:
        raise ValueError("FFmpeg did not produce any video frames.")
    return frames
