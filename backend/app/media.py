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
