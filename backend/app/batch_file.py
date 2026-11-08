import csv
import json
import os
import time
from pathlib import Path

# Import the core analysis function from local_tube_ocr
from app.local_tube_ocr import process_tube_video

# Supported video formats
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv"}

def run_batch_unified_table(input_dir: str = ".", output_dir: str = "batch_results"):
    """
    Scans a folder for videos, analyzes each tube with GPU-accelerated OCR,
    and consolidates all findings into a clean master table with CSV and JSON logs.
    """
    os.makedirs(output_dir, exist_ok=True)
    frames_base_dir = os.path.join(output_dir, "frames")

    video_paths = [
        os.path.join(input_dir, f)
        for f in os.listdir(input_dir)
        if Path(f).suffix.lower() in VIDEO_EXTENSIONS
    ]

    if not video_paths:
        print(f"No video files found in directory: '{input_dir}'")
        return

    print(f"\nDiscovered {len(video_paths)} videos in '{input_dir}'. Initializing batch pipeline...\n")
    batch_start = time.perf_counter()
    summary_records = []

    for idx, vid_path in enumerate(video_paths, start=1):
        filename = os.path.basename(vid_path)
        stem = Path(filename).stem
        target_frame_dir = os.path.join(frames_base_dir, stem)

        print(f"[{idx:02d}/{len(video_paths):02d}] Processing: {filename} ...", end=" ", flush=True)
        t0 = time.perf_counter()

        try:
            result = process_tube_video(vid_path, output_dir=target_frame_dir)
            row = result.get("table_row", {})
            timing = result.get("timing", {})
            duration = time.perf_counter() - t0
            print(f"Done ({duration:.2f}s)")

            summary_records.append({
                "Filename": filename,
                "Status": "SUCCESS",
                "Tube Type": result.get("tube_type", "N/A"),
                "Sample ID": row.get("Sample ID", {}).get("value", "N/A"),
                "Sample ID Conf": row.get("Sample ID", {}).get("confidence", 0.0),
                "Date Sampled": row.get("Date Sampled", {}).get("value", "N/A"),
                "Date Sampled Conf": row.get("Date Sampled", {}).get("confidence", 0.0),
                "Date Received": row.get("Date Received", {}).get("value", "N/A"),
                "Date Received Conf": row.get("Date Received", {}).get("confidence", 1.0),
                "Machine": row.get("Machine", {}).get("value", "N/A"),
                "Machine Conf": row.get("Machine", {}).get("confidence", 0.0),
                "Component": row.get("Component", {}).get("value", "N/A"),
                "Component Conf": row.get("Component", {}).get("confidence", 0.0),
                "Serial Number": row.get("Serial Number", {}).get("value", "N/A"),
                "Serial Number Conf": row.get("Serial Number", {}).get("confidence", 0.0),
                "Reference Lube": row.get("Reference Lube", {}).get("value", "N/A"),
                "Reference Lube Conf": row.get("Reference Lube", {}).get("confidence", 0.0),
                "Keyframe Extraction Time (s)": timing.get("keyframe_duration_sec", 0.0),
                "OCR Inference Time (s)": timing.get("ocr_duration_sec", 0.0),
                "Duration (s)": round(duration, 2)
            })

        except Exception as e:
            duration = time.perf_counter() - t0
            print(f"FAILED ({duration:.2f}s) -> {e}")
            summary_records.append({
                "Filename": filename,
                "Status": f"FAILED: {e}",
                "Tube Type": "N/A",
                "Sample ID": "N/A",
                "Sample ID Conf": 0.0,
                "Date Sampled": "N/A",
                "Date Sampled Conf": 0.0,
                "Date Received": "N/A",
                "Date Received Conf": 0.0,
                "Machine": "N/A",
                "Machine Conf": 0.0,
                "Component": "N/A",
                "Component Conf": 0.0,
                "Serial Number": "N/A",
                "Serial Number Conf": 0.0,
                "Reference Lube": "N/A",
                "Reference Lube Conf": 0.0,
                "Keyframe Extraction Time (s)": 0.0,
                "OCR Inference Time (s)": 0.0,
                "Duration (s)": round(duration, 2)
            })

    total_batch_time = time.perf_counter() - batch_start

    # ---------------------------------------------------------
    # Render Unified Master Table
    # ---------------------------------------------------------
    col_w = {
        "file": 32,
        "type": 7,
        "sid": 18,
        "dsamp": 16,
        "drec": 11,
        "mach": 24,
        "comp": 22,
        "sn": 18,
        "lube": 22
    }

    total_width = sum(col_w.values()) + (len(col_w) * 3) - 1

    print("\n" + "=" * total_width)
    print(" " * max(0, (total_width - 34) // 2) + "CONSOLIDATED LABORATORY MASTER LOG")
    print("=" * total_width)

    header = (
        f"{'Video Source':<{col_w['file']}} | "
        f"{'Type':<{col_w['type']}} | "
        f"{'Sample ID':<{col_w['sid']}} | "
        f"{'Date Sampled':<{col_w['dsamp']}} | "
        f"{'Date Recv':<{col_w['drec']}} | "
        f"{'Machine':<{col_w['mach']}} | "
        f"{'Component':<{col_w['comp']}} | "
        f"{'Serial Number':<{col_w['sn']}} | "
        f"{'Ref Lube':<{col_w['lube']}}"
    )
    print(header)
    print("-" * total_width)

    def fmt_val_conf(val, conf):
        if val in ("N/A", "[Leave Blank]", ""):
            return val
        return f"{val} [{conf:.2f}]"

    for item in summary_records:
        sid_str = fmt_val_conf(item["Sample ID"], item["Sample ID Conf"])
        dsamp_str = fmt_val_conf(item["Date Sampled"], item["Date Sampled Conf"])
        mach_str = fmt_val_conf(item["Machine"], item["Machine Conf"])
        comp_str = fmt_val_conf(item["Component"], item["Component Conf"])
        sn_str = fmt_val_conf(item["Serial Number"], item["Serial Number Conf"])
        lube_str = fmt_val_conf(item["Reference Lube"], item["Reference Lube Conf"])

        row_str = (
            f"{item['Filename'][:col_w['file']]:<{col_w['file']}} | "
            f"{item['Tube Type']:<{col_w['type']}} | "
            f"{sid_str:<{col_w['sid']}} | "
            f"{dsamp_str:<{col_w['dsamp']}} | "
            f"{item['Date Received']:<{col_w['drec']}} | "
            f"{mach_str:<{col_w['mach']}} | "
            f"{comp_str:<{col_w['comp']}} | "
            f"{sn_str:<{col_w['sn']}} | "
            f"{lube_str:<{col_w['lube']}}"
        )
        print(row_str)

    print("=" * total_width)
    print(f"Total Batched: {len(video_paths)} videos | Total Elapsed Time: {total_batch_time:.2f} s\n")

    # ---------------------------------------------------------
    # Disk Exports (CSV & JSON)
    # ---------------------------------------------------------
    csv_file = os.path.join(output_dir, "master_tube_log.csv")
    fieldnames = list(summary_records[0].keys())
    with open(csv_file, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(summary_records)

    json_file = os.path.join(output_dir, "master_tube_log.json")
    with open(json_file, mode="w", encoding="utf-8") as f:
        json.dump(summary_records, f, indent=2)

    print(f"Exported Master CSV  -> {csv_file}")
    print(f"Exported Master JSON -> {json_file}")
    print(f"Debug Frames Stored  -> {frames_base_dir}/")

if __name__ == "__main__":
    run_batch_unified_table(input_dir=".", output_dir="batch_results")