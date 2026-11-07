"""Test timing collection and report with no network or database."""
import json

from app import timing
from app.timing_report import parse_events, percentile, render_report


def test_timer(monkeypatch, capsys):
    clock = iter([0.0, 0.005, 0.020, 0.030])
    monkeypatch.setattr(timing, "perf_counter", lambda: next(clock))
    t = timing.JobTimer()
    t.begin("source_lookup")
    t.begin("gemini")
    result = t.emit(
        sample_id="fake-id", status="failed", model="example",
        frame_count=8, jpeg_bytes=2048, gemini_ms={"api_request": 9.5},
    )
    output = capsys.readouterr().out.strip()
    assert output.startswith("MRG_TIMING ")
    assert json.loads(output.split("MRG_TIMING ", 1)[1]) == result
    assert result["stages_ms"] == {"source_lookup": 15.0, "gemini": 10.0}
    assert result["total_ms"] == 30.0
    assert result["jpeg_kib"] == 2.0


def test_report_separates_completed_and_failed():
    ok = {"sample_id": "abc", "model": "test-model", "status": "completed",
          "total_ms": 10000, "frame_count": 8,
          "stages_ms": {"frame_selection": 1500, "gemini": 8000},
          "gemini_ms": {"api_request": 7800}}
    fail = {"sample_id": "def", "model": "test-model", "status": "failed",
            "total_ms": 3000, "frame_count": 8,
            "stages_ms": {"gemini": 2800},
            "gemini_ms": {"api_request": 2700}}
    events = parse_events(["worker | unrelated\n",
                           "worker | MRG_TIMING not-json\n",
                           "worker | MRG_TIMING " + json.dumps(ok) + "\n",
                           "worker | MRG_TIMING " + json.dumps(fail) + "\n"])
    assert events == [ok, fail]
    summary = render_report(events)
    assert "1 completed, 1 failed" in summary
    assert "OpenCV frame selection" in summary
    assert "API request / wait" in summary
    assert "Failed jobs" in summary


def test_percentiles():
    assert percentile([5], .9) == 5
    assert percentile([1, 3, 5], .5) == 3
    assert percentile([1, 3, 5], .9) == 4.6
