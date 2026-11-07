"""Frame extraction tests do not call Gemini or require real sample recordings."""
import cv2
import numpy as np
import pytest

from app.frame_selection import InvalidVideo, select_frames


def test_extracts_time_distributed_frames(tmp_path):
    video = tmp_path / "rotation.avi"
    writer = cv2.VideoWriter(
        str(video), cv2.VideoWriter_fourcc(*"MJPG"), 20.0, (640, 360)
    )
    if not writer.isOpened():
        pytest.skip("MJPG writer is not available in the OpenCV build")
    for index in range(40):
        frame = np.full((360, 640, 3), 200, dtype=np.uint8)
        cv2.putText(
            frame, f"SN {index:02d}", (90, 170), cv2.FONT_HERSHEY_SIMPLEX,
            2, (0, 0, 0), 4,
        )
        writer.write(frame)
    writer.release()
    result = select_frames(video, count=8)
    assert len(result) == 8
    assert [frame.timestamp_seconds for frame in result] == sorted(
        frame.timestamp_seconds for frame in result
    )
    assert result[-1].timestamp_seconds > result[0].timestamp_seconds
    assert all(frame.jpeg.startswith(b"\xff\xd8") for frame in result)


def test_rejects_non_video(tmp_path):
    video = tmp_path / "broken.mov"
    video.write_bytes(b"bad")
    with pytest.raises(InvalidVideo):
        select_frames(video)


def test_rejects_excessive_frame_count(tmp_path):
    with pytest.raises(ValueError):
        select_frames(tmp_path / "unused.mov", count=100)
