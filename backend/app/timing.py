"""Single-line per-job timing events using monotonic wall-clock readings.

Each event is emitted to Docker worker logs without secrets, label text, model
output, or image bytes. The timings are not token costs or model compute time.
"""
import json
from time import perf_counter


class JobTimer:
    def __init__(self) -> None:
        self.started = perf_counter()
        self._active: str | None = None
        self._active_since = self.started
        self.stages_ms: dict[str, float] = {}

    def begin(self, stage: str) -> None:
        """End the previous stage and start the next; safe during exceptions."""
        now = perf_counter()
        if self._active is not None:
            self.stages_ms[self._active] = round((now - self._active_since) * 1000, 2)
        self._active = stage
        self._active_since = now

    def emit(
        self, *, sample_id: str, status: str, model: str, frame_count: int,
        jpeg_bytes: int, gemini_ms: dict[str, float],
    ) -> dict:
        now = perf_counter()
        if self._active is not None:
            self.stages_ms[self._active] = round((now - self._active_since) * 1000, 2)
            self._active = None
        event = {
            "sample_id": sample_id,
            "status": status,
            "model": model,
            "frame_count": frame_count,
            "jpeg_kib": round(jpeg_bytes / 1024, 1),
            "total_ms": round((now - self.started) * 1000, 2),
            "stages_ms": self.stages_ms,
            "gemini_ms": gemini_ms,
        }
        # RQ uses subprocesses for jobs. Flush before possible RQ traceback.
        print("MRG_TIMING " + json.dumps(event, separators=(",", ":"), sort_keys=True),
              flush=True)
        return event
