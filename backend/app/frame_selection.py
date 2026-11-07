"""Select sharp, time-distributed stills from short tube-rotation recordings.

Only local OpenCV decoding is performed here. No Gemini API requests.
"""
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass(frozen=True)
class SelectedFrame:
    timestamp_seconds: float
    jpeg: bytes
    sharpness: float
    # Optional original-resolution center crop for visual handwriting evidence.
    detail_jpeg: bytes | None = None


class InvalidVideo(ValueError):
    pass


def _encode(frame: np.ndarray) -> bytes:
    height, width = frame.shape[:2]
    if min(height, width) < 100:
        raise InvalidVideo("Video frames are too small to read labels.")
    # Keep small handwriting legible; limit unexpectedly enormous requests.
    scale = min(1.0, 1920 / max(height, width))
    if scale < 1:
        frame = cv2.resize(frame, (round(width * scale), round(height * scale)),
                           interpolation=cv2.INTER_AREA)
    ok, output = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok:
        raise InvalidVideo("Could not encode a selected frame.")
    return output.tobytes()


def _encode_detail(frame: np.ndarray) -> bytes:
    """Crop likely central tube text without inventing/enhancing characters.

    This is not a trained date detector; the full frames remain available.
    """
    height, width = frame.shape[:2]
    x0, x1 = round(width * 0.08), round(width * 0.92)
    y0, y1 = round(height * 0.24), round(height * 0.76)
    detail = frame[y0:y1, x0:x1]
    if min(detail.shape[:2]) < 80:
        # Tiny but valid videos should still be analyzed using original frames.
        return _encode(frame)
    ok, output = cv2.imencode(".jpg", detail, [cv2.IMWRITE_JPEG_QUALITY, 94])
    if not ok:
        raise InvalidVideo("Could not encode tube detail crop.")
    return output.tobytes()


def select_frames(path: Path, count: int = 8, candidate_count: int = 32) -> list[SelectedFrame]:
    """Sample candidate frames across full rotation; pick the sharpest in each time bin.

    Uses exactly one Gemini request later, regardless of the selected frame count.
    Does not claim to guarantee an unobstructed view of every label segment.
    """
    if not 1 <= count <= 12:
        raise ValueError("Frame count must be between 1 and 12")
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise InvalidVideo("Could not decode the uploaded video.")
    try:
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
        if total <= 0 or fps <= 0:
            raise InvalidVideo("Could not inspect the video frame count or frame rate.")
        duration = total / fps
        if duration > 15:
            raise InvalidVideo("Video must be 15 seconds or shorter.")
        if total < 2:
            raise InvalidVideo("Video must contain at least two frames.")
        indices = np.unique(np.linspace(0, total - 1, min(candidate_count, total), dtype=int))
        candidates: list[tuple[float, float, np.ndarray]] = []
        for index in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(index))
            ok, frame = cap.read()
            if not ok or frame is None:
                continue
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            preview = cv2.resize(gray, (320, 240), interpolation=cv2.INTER_AREA)
            sharpness = float(cv2.Laplacian(preview, cv2.CV_64F).var())
            candidates.append((float(index) / fps, sharpness, frame))
        if not candidates:
            raise InvalidVideo("No readable frames could be decoded.")
        frames: list[SelectedFrame] = []
        actual_count = min(count, len(candidates))
        for bin_index in range(actual_count):
            lo = bin_index * len(candidates) // actual_count
            hi = (bin_index + 1) * len(candidates) // actual_count
            best = max(candidates[lo:hi], key=lambda item: item[1])
            frames.append(SelectedFrame(
                timestamp_seconds=best[0], jpeg=_encode(best[2]),
                sharpness=best[1], detail_jpeg=_encode_detail(best[2]),
            ))
        return sorted(frames, key=lambda frame: frame.timestamp_seconds)
    finally:
        cap.release()
