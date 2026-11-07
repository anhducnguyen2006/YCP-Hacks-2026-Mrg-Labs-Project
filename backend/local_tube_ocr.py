import os
import sys

# ---------------------------------------------------------
# Step 0: CUDA / DLL Path Configuration & GPU Device Setup
# ---------------------------------------------------------
cuda_bin = r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.1\bin"
if os.path.exists(cuda_bin):
    os.add_dll_directory(cuda_bin)
    os.environ["PATH"] = cuda_bin + ";" + os.environ["PATH"]

venv_site = os.path.join(sys.prefix, "Lib", "site-packages")
for sub in ["cublas", "cudnn"]:
    p = os.path.join(venv_site, "nvidia", sub, "bin")
    if os.path.exists(p):
        os.add_dll_directory(p)
        os.environ["PATH"] = p + ";" + os.environ["PATH"]

import cv2
import numpy as np
import paddle
from paddleocr import PaddleOCR

# Force execution on discrete GPU
if paddle.device.is_compiled_with_cuda():
    paddle.device.set_device("gpu:0")

# Standard PaddleOCR 3.x constructor with valid arguments
ocr = PaddleOCR(use_textline_orientation=True, lang="en", device="gpu")

# ---------------------------------------------------------
# Step 1: Unicode & Selective Enclosure Detection
# ---------------------------------------------------------
CIRCLED_UNICODE_MAP = {
    "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5, "⑥": 6,
    "⑦": 7, "⑧": 8, "⑨": 9, "⑩": 10
}

def extract_circled_digits_from_unicode(text: str):
    """Detects Unicode circled digit glyphs directly recognized by OCR."""
    return [CIRCLED_UNICODE_MAP[ch] for ch in text if ch in CIRCLED_UNICODE_MAP]

def poly_to_box(poly):
    """Converts a detection polygon to an axis-aligned [x1, y1, x2, y2] bounding box."""
    pts = np.array(poly, dtype=np.int32)
    x1, y1 = np.min(pts, axis=0)
    x2, y2 = np.max(pts, axis=0)
    return [int(x1), int(y1), int(x2), int(y2)]

def check_word_enclosure_by_contour(img_bgr: np.ndarray, poly) -> float:
    """
    Evaluates whether a text region (defined by its polygon) is encircled
    by a dark ink loop/oval in the corresponding image coordinates.
    """
    h_img, w_img = img_bgr.shape[:2]
    pts = np.array(poly, dtype=np.int32)
    x1, y1 = np.min(pts, axis=0)
    x2, y2 = np.max(pts, axis=0)
    
    tcx, tcy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
    word_w = max(1, x2 - x1)
    word_h = max(1, y2 - y1)

    pad = 22
    rx1, ry1 = max(0, x1 - pad), max(0, y1 - pad)
    rx2, ry2 = min(w_img, x2 + pad), min(h_img, y2 + pad)

    roi = img_bgr[ry1:ry2, rx1:rx2]
    if roi.size == 0:
        return 0.0

    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    thresh = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 21, 8
    )

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    local_cx, local_cy = tcx - rx1, tcy - ry1
    enclosure_score = 0.0

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < (word_w * word_h * 0.35):
            continue

        dist = cv2.pointPolygonTest(cnt, (float(local_cx), float(local_cy)), True)
        if dist >= -2.0:
            bx, by, bw, bh = cv2.boundingRect(cnt)
            if bw >= word_w * 0.65 and bh >= word_h * 0.65:
                enclosure_score = max(enclosure_score, 1.0 + dist)

    # Vertical band ink check (above and below word only)
    top_band = thresh[max(0, int(y1 - ry1 - 8)):int(y1 - ry1), int(x1 - rx1):int(x2 - rx1)]
    bot_band = thresh[int(y2 - ry1):min(thresh.shape[0], int(y2 - ry1 + 8)), int(x1 - rx1):int(x2 - rx1)]
    
    vertical_ink = 0
    total_pixels = 0
    for band in [top_band, bot_band]:
        if band.size > 0:
            vertical_ink += cv2.countNonZero(band)
            total_pixels += band.size

    vert_density = (vertical_ink / float(total_pixels)) if total_pixels > 0 else 0.0
    return enclosure_score + (vert_density * 2.0)

def resolve_assay_choice(assay_candidates):
    """Resolves mutually exclusive options ('GS' vs 'NGS')."""
    if not assay_candidates:
        return None

    ngs_scores = [c["score"] for c in assay_candidates if c["text"] == "NGS"]
    gs_scores = [c["score"] for c in assay_candidates if c["text"] == "GS"]

    avg_ngs = float(np.mean(ngs_scores)) if ngs_scores else 0.0
    avg_gs = float(np.mean(gs_scores)) if gs_scores else 0.0

    print(f"[Debug Enclosure Scores] NGS: {avg_ngs:.3f} | GS: {avg_gs:.3f}")

    if avg_ngs > avg_gs:
        return "NGS"
    elif avg_gs > avg_ngs and (avg_gs - avg_ngs) > 0.3:
        return "GS"

    return "NGS" if avg_ngs > 0.2 else None

# ---------------------------------------------------------
# Step 2: Keyframe Selection by Laplacian Sharpness
# ---------------------------------------------------------
def get_laplacian_sharpness(frame: np.ndarray) -> float:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return cv2.Laplacian(gray, cv2.CV_64F).var()

def extract_best_keyframes(video_path: str, top_k: int = 6, min_frame_distance: int = 10):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise FileNotFoundError(f"Could not open video file: {video_path}")

    all_frames = []
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        score = get_laplacian_sharpness(frame)
        all_frames.append((frame_idx, score, frame))
        frame_idx += 1

    cap.release()

    sorted_by_sharpness = sorted(all_frames, key=lambda x: x[1], reverse=True)

    selected = []
    for idx, score, frame in sorted_by_sharpness:
        if all(abs(idx - s[0]) >= min_frame_distance for s in selected):
            selected.append((idx, score, frame))
        if len(selected) >= top_k:
            break

    selected.sort(key=lambda x: x[0])
    return selected

# ---------------------------------------------------------
# Step 3: Inference, Frame Export & Targeted Extraction
# ---------------------------------------------------------
def process_tube_video(video_path: str, output_dir: str = "extracted_ocr_frames"):
    print(f"Loading and processing: {video_path}")
    os.makedirs(output_dir, exist_ok=True)

    keyframes = extract_best_keyframes(video_path, top_k=6, min_frame_distance=10)
    print(f"Selected {len(keyframes)} distributed sharp keyframes.")

    accumulated_results = []
    assay_candidates = []
    detected_passages = set()

    for rank, (frame_idx, score, frame) in enumerate(keyframes):
        frame_filename = os.path.join(output_dir, f"frame_{rank}_id{frame_idx}.jpg")
        cv2.imwrite(frame_filename, frame)

        res = ocr.predict(frame)
        if not res:
            continue

        data = res[0]
        texts = data.get("rec_texts", [])
        scores = data.get("rec_scores", [])
        polys = data.get("dt_polys", [])
        if not polys:
            polys = data.get("rec_polys", [])

        # CRITICAL FIX: Use the image that dt_polys are actually mapped to
        doc_res = data.get("doc_preprocessor_res", {})
        if isinstance(doc_res, dict) and "output_img" in doc_res and doc_res["output_img"] is not None:
            active_img = doc_res["output_img"]
        else:
            active_img = frame

        annotated = active_img.copy()
        words_found_in_frame = False

        for idx, (text, conf) in enumerate(zip(texts, scores)):
            if conf < 0.25:
                continue

            words_found_in_frame = True
            clean_text = text.strip()

            poly = polys[idx] if idx < len(polys) else None
            box = poly_to_box(poly) if poly is not None else []

            if poly is not None:
                pts = np.array(poly, dtype=np.int32).reshape((-1, 1, 2))
                cv2.polylines(annotated, [pts], isClosed=True, color=(0, 255, 0), thickness=2)

                bx1, by1 = box[0], box[1]
                cv2.putText(
                    annotated,
                    clean_text,
                    (bx1, max(18, by1 - 6)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.45,
                    (0, 0, 255),
                    1,
                    cv2.LINE_AA,
                )

            # 1. Unicode Circled Digits (Passage Number e.g. ⑤)
            unicode_matches = extract_circled_digits_from_unicode(clean_text)
            for num in unicode_matches:
                detected_passages.add(num)

            # 2. Targeted Enclosure Check for GS vs NGS
            upper_t = clean_text.upper()
            if poly is not None and (upper_t == "GS" or "NGS" in upper_t):
                target_label = "NGS" if "NGS" in upper_t else "GS"
                # Evaluate contour enclosure on the exact image space where polygons live
                enc_score = check_word_enclosure_by_contour(active_img, poly)
                assay_candidates.append({
                    "text": target_label,
                    "score": enc_score,
                    "frame_index": frame_idx
                })

            accumulated_results.append({
                "frame_index": frame_idx,
                "text": clean_text,
                "confidence": round(float(conf), 3),
                "saved_frame": frame_filename
            })

        if words_found_in_frame:
            annotated_filename = os.path.join(output_dir, f"frame_{rank}_id{frame_idx}_annotated.jpg")
            cv2.imwrite(annotated_filename, annotated)

    print(f"Exported {len(keyframes)} frames and annotated detections to '{output_dir}/'.")

    # Deduplicate general text readings
    unique_texts = {}
    for entry in accumulated_results:
        t = entry["text"]
        if t not in unique_texts or entry["confidence"] > unique_texts[t]["confidence"]:
            unique_texts[t] = entry

    print("\n================ OCR Readings ================")
    for text, d in sorted(unique_texts.items(), key=lambda x: x[1]["confidence"], reverse=True):
        print(f"[{d['confidence']}] {text} (Frame {d['frame_index']} -> {d['saved_frame']})")

    # Resolve circled assay choice
    chosen_assay = resolve_assay_choice(assay_candidates)

    print("\n============= Extracted Tube Metadata =============")
    print(f"Assay Choice    : {chosen_assay if chosen_assay else 'Uncertain / Not Circled'}")
    print(f"Passage Count   : {sorted(list(detected_passages)) if detected_passages else 'Not Detected'}")

    return {
        "readings": unique_texts,
        "assay": chosen_assay,
        "passage": sorted(list(detected_passages)),
        "export_folder": output_dir
    }

if __name__ == "__main__":
    video_file = "VID_20261106_231515.mp4"
    if os.path.exists(video_file):
        results = process_tube_video(video_file, output_dir="extracted_ocr_frames")
    else:
        print(f"Error: Could not find '{video_file}' in the current working directory.")