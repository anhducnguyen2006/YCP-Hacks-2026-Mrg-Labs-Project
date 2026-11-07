"""Summarize MRG_TIMING events from worker Docker logs."""
import argparse
import json
import sys
from collections.abc import Iterable
from pathlib import Path

MARKER = "MRG_TIMING "
METRICS = [
    ("Total job", "total_ms", None),
    ("Source lookup", "stages_ms", "source_lookup"),
    ("OpenCV frame selection", "stages_ms", "frame_selection"),
    ("Store keyframes", "stages_ms", "keyframe_storage"),
    ("Gemini stage", "stages_ms", "gemini"),
    ("  Encode images", "gemini_ms", "encode_images"),
    ("  SDK client setup", "gemini_ms", "client_setup"),
    ("  API request / wait", "gemini_ms", "api_request"),
    ("  Validate JSON", "gemini_ms", "validate_response"),
    ("Store results", "stages_ms", "result_storage"),
]


def parse_events(lines: Iterable[str]) -> list[dict]:
    result = []
    for line in lines:
        if MARKER not in line:
            continue
        try:
            record = json.loads(line.split(MARKER, 1)[1].strip())
        except (ValueError, json.JSONDecodeError):
            continue
        if isinstance(record, dict) and record.get("status") in {"completed", "failed"}:
            result.append(record)
    return result


def percentile(values: list[float], fraction: float) -> float:
    values = sorted(values)
    if not values:
        raise ValueError("No observations")
    index = (len(values) - 1) * fraction
    left = int(index)
    right = min(left + 1, len(values) - 1)
    return values[left] + (values[right] - values[left]) * (index - left)


def render_report(events: list[dict]) -> str:
    if not events:
        return "No MRG_TIMING events found. Run new scans on the instrumentation branch first."
    completed = [e for e in events if e["status"] == "completed"]
    failed = [e for e in events if e["status"] == "failed"]
    models = ", ".join(sorted({str(e.get("model", "?")) for e in events}))
    lines = [
        f"Scanner timing: {len(events)} jobs, {len(completed)} completed, {len(failed)} failed",
        f"Models: {models}",
        "Seconds. p50/p90 are provisional for small sample sizes.",
        "",
        f"{'Successful job stage':26} {'n':>3} {'p50':>8} {'p90':>8} {'min':>8} {'max':>8}",
        "-" * 67,
    ]
    for label, group, key in METRICS:
        readings = []
        for e in completed:
            value = e.get(group) if key is None else e.get(group, {}).get(key)
            if isinstance(value, (int, float)):
                readings.append(float(value) / 1000)
        if readings:
            lines.append(
                f"{label:26} {len(readings):>3} {percentile(readings, .5):>8.2f}"
                f" {percentile(readings, .9):>8.2f} {min(readings):>8.2f}"
                f" {max(readings):>8.2f}"
            )
    if failed:
        lines += ["", "Failed jobs (elapsed seconds):"]
        for e in failed[-10:]:
            lines.append(f"  {str(e.get('sample_id', '?'))[:8]}"
                         f" {float(e.get('total_ms', 0)) / 1000:.2f}s")
    lines += ["", "Recent scans (last ten):"]
    for e in events[-10:]:
        request = e.get("gemini_ms", {}).get("api_request")
        request_sec = f"{request / 1000:.2f}s" if isinstance(request, (float, int)) else "n/a"
        lines.append(f"  {str(e.get('sample_id', '?'))[:8]} {e['status']}"
                     f" total={float(e.get('total_ms', 0)) / 1000:.2f}s"
                     f" api={request_sec} frames={e.get('frame_count', '?')}")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", nargs="?", default="-")
    args = parser.parse_args()
    if args.file == "-":
        print(render_report(parse_events(sys.stdin)))
    else:
        with Path(args.file).open(encoding="utf-8", errors="replace") as source:
            print(render_report(parse_events(source)))


if __name__ == "__main__":
    main()
