import os
import re
import sys
import time
from collections import Counter
from datetime import datetime
from functools import lru_cache

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

@lru_cache(maxsize=1)
def get_ocr():
    """Initialize only in the worker, choosing CPU or an explicitly requested GPU."""
    device = os.getenv("OCR_DEVICE", "cpu").strip().lower()
    if device not in {"cpu", "gpu", "gpu:0"}:
        raise ValueError("OCR_DEVICE must be cpu or gpu:0")
    if device.startswith("gpu") and not paddle.device.is_compiled_with_cuda():
        raise RuntimeError(
            "OCR_DEVICE requests NVIDIA GPU, but this PaddlePaddle installation "
            "does not have CUDA support. Use OCR_DEVICE=cpu or the GPU Docker override."
        )
    return PaddleOCR(use_textline_orientation=True, lang="en",
                     device="gpu:0" if device.startswith("gpu") else "cpu")


# ---------------------------------------------------------
# Step 1: Enclosure & Selective Feature Detection
# ---------------------------------------------------------
CIRCLED_UNICODE_MAP = {
    "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5, "⑥": 6,
    "⑦": 7, "⑧": 8, "⑨": 9, "⑩": 10
}

MONTH_REGEX = r"(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)"

MONTH_MAP = {
    "JAN": "01", "FEB": "02", "MAR": "03", "APR": "04",
    "MAY": "05", "JUN": "06", "JUL": "07", "AUG": "08",
    "SEP": "09", "OCT": "10", "NOV": "11", "DEC": "12"
}

def extract_circled_digits_from_unicode(text: str):
    return [CIRCLED_UNICODE_MAP[ch] for ch in text if ch in CIRCLED_UNICODE_MAP]

def poly_to_box(poly):
    pts = np.array(poly, dtype=np.int32)
    x1, y1 = np.min(pts, axis=0)
    x2, y2 = np.max(pts, axis=0)
    return [int(x1), int(y1), int(x2), int(y2)]

def evaluate_contour_and_ink(roi_bgr: np.ndarray, tag: str = "", save_debug_dir: str = None) -> float:
    """
    Measures circular ink loops and peripheral ink density inside an ROI.
    Saves debug crops when save_debug_dir is provided.
    """
    if roi_bgr is None or roi_bgr.size == 0:
        return 0.0

    h, w = roi_bgr.shape[:2]
    gray = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY)
    
    # Adaptive threshold to isolate pen marks
    thresh = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 21, 7
    )
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    if save_debug_dir and tag:
        cv2.imwrite(os.path.join(save_debug_dir, f"thresh_{tag}.jpg"), thresh)

    contours, _ = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    cx, cy = w / 2.0, h / 2.0
    contour_score = 0.0

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < (w * h * 0.12):
            continue
        dist = cv2.pointPolygonTest(cnt, (float(cx), float(cy)), True)
        bx, by, bw, bh = cv2.boundingRect(cnt)
        if bw >= w * 0.45 and bh >= h * 0.45 and dist >= -4.0:
            contour_score = max(contour_score, 1.5 + max(0.0, dist))

    # Outer perimeter ink density (bands above, below, left, right)
    t_band = thresh[0:max(1, int(h * 0.22)), :]
    b_band = thresh[min(h - 1, int(h * 0.78)):h, :]
    l_band = thresh[:, 0:max(1, int(w * 0.22))]
    r_band = thresh[:, min(w - 1, int(w * 0.78)):w]

    outer_ink = sum(cv2.countNonZero(b) for b in [t_band, b_band, l_band, r_band])
    outer_pixels = sum(b.size for b in [t_band, b_band, l_band, r_band])
    density = (outer_ink / float(outer_pixels)) if outer_pixels > 0 else 0.0

    total_score = contour_score + (density * 3.0)
    return total_score

def analyze_assay_enclosure(img_bgr: np.ndarray, detected_poly, text_val: str, frame_idx: int, debug_dir: str):
    """
    Evaluates both GS and NGS regions concurrently, even if only one was detected by OCR.
    """
    h_img, w_img = img_bgr.shape[:2]
    x1, y1, x2, y2 = poly_to_box(detected_poly)
    word_w = max(10, x2 - x1)
    word_h = max(10, y2 - y1)
    pad = 8

    # Define bounding regions for both GS and NGS based on the anchor detection
    if "NGS" in text_val.upper():
        ngs_box = [max(0, x1 - pad), max(0, y1 - pad), min(w_img, x2 + pad), min(h_img, y2 + pad)]
        # GS sits to the left of NGS
        gs_x2 = x1
        gs_x1 = max(0, x1 - int(word_w * 1.15))
        gs_box = [max(0, gs_x1 - pad), max(0, y1 - pad), min(w_img, gs_x2 + pad), min(h_img, y2 + pad)]
    else:  # 'GS' was the detected anchor
        gs_box = [max(0, x1 - pad), max(0, y1 - pad), min(w_img, x2 + pad), min(h_img, y2 + pad)]
        # NGS sits to the right of GS
        ngs_x1 = x2
        ngs_x2 = min(w_img, x2 + int(word_w * 1.25))
        ngs_box = [max(0, ngs_x1 - pad), max(0, y1 - pad), min(w_img, ngs_x2 + pad), min(h_img, y2 + pad)]

    gs_roi = img_bgr[gs_box[1]:gs_box[3], gs_box[0]:gs_box[2]]
    ngs_roi = img_bgr[ngs_box[1]:ngs_box[3], ngs_box[0]:ngs_box[2]]

    gs_score = evaluate_contour_and_ink(gs_roi, tag=f"f{frame_idx}_GS", save_debug_dir=debug_dir)
    ngs_score = evaluate_contour_and_ink(ngs_roi, tag=f"f{frame_idx}_NGS", save_debug_dir=debug_dir)

    print(f"  [Assay Debug Frame {frame_idx:02d}] GS Score: {gs_score:.3f} | NGS Score: {ngs_score:.3f}")
    return gs_score, ngs_score

def analyze_passage_enclosure(img_bgr: np.ndarray, passage_poly, frame_idx: int, debug_dir: str):
    """
    Extracts individual slots 1 through 6 across the passage line and logs enclosure scores.
    """
    h_img, w_img = img_bgr.shape[:2]
    x1, y1, x2, y2 = poly_to_box(passage_poly)
    total_w = max(1, x2 - x1)
    slot_w = total_w / 6.0

    scores = {}
    for d in range(1, 7):
        sx1 = max(0, int(x1 + (d - 1) * slot_w - 4))
        sx2 = min(w_img, int(x1 + d * slot_w + 4))
        sy1 = max(0, y1 - 6)
        sy2 = min(h_img, y2 + 6)
        
        roi = img_bgr[sy1:sy2, sx1:sx2]
        score = evaluate_contour_and_ink(roi, tag=f"f{frame_idx}_dig{d}", save_debug_dir=debug_dir)
        scores[d] = score

    best_d = max(scores, key=scores.get)
    print(f"  [Passage Debug Frame {frame_idx:02d}] Digits 1-6 Scores: " + 
          ", ".join(f"{d}:{scores[d]:.2f}" for d in range(1, 7)) + 
          f" -> Winner: {best_d} ({scores[best_d]:.2f})")

    return best_d, scores[best_d]

# ---------------------------------------------------------
# Step 2: Temporal Window Keyframe Selection
# ---------------------------------------------------------
def get_laplacian_sharpness(frame: np.ndarray) -> float:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return cv2.Laplacian(gray, cv2.CV_64F).var()

def extract_best_keyframes(video_path: str, top_k: int = 8):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise FileNotFoundError(f"Could not open video file: {video_path}")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total_frames <= 0:
        frames_list = []
        f_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frames_list.append((f_idx, frame))
            f_idx += 1
        total_frames = len(frames_list)
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

    window_size = max(1, total_frames // top_k)
    selected_keyframes = []

    for w_idx in range(top_k):
        start_f = w_idx * window_size
        end_f = total_frames if w_idx == top_k - 1 else (w_idx + 1) * window_size

        best_score = -1.0
        best_frame = None
        best_id = start_f

        cap.set(cv2.CAP_PROP_POS_FRAMES, start_f)
        for cur_id in range(start_f, end_f):
            ret, frame = cap.read()
            if not ret:
                break
            score = get_laplacian_sharpness(frame)
            if score > best_score:
                best_score = score
                best_frame = frame
                best_id = cur_id

        if best_frame is not None:
            selected_keyframes.append((best_id, best_score, best_frame))

    cap.release()
    selected_keyframes.sort(key=lambda x: x[0])
    return selected_keyframes

# ---------------------------------------------------------
# Step 3: Date Normalization & Schema Mapping
# ---------------------------------------------------------
def normalize_to_mmddyy(date_raw: str):
    if not date_raw or date_raw == "N/A":
        return "N/A", False

    cleaned = re.sub(r"Date\s*[:\-]?", "", date_raw, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"[gq]", "9", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"c$", "0", cleaned, flags=re.IGNORECASE)

    alpha_match = re.search(
        rf"(\d{{1,2}})\s*[-/]?\s*({MONTH_REGEX})\s*[-/]?\s*(\d{{2,4}})?",
        cleaned,
        re.IGNORECASE
    )
    if alpha_match:
        day_val = int(alpha_match.group(1))
        month_str = alpha_match.group(2).upper()
        year_val = alpha_match.group(3)
        # An absent year cannot be inferred safely from today's date.
        if not year_val:
            return cleaned, False
        month_val = MONTH_MAP.get(month_str, "01")
        return f"{month_val}{day_val:02d}{year_val[-2:]}", True

    num_match_valid = re.search(r"(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})\b", cleaned)
    if num_match_valid:
        m_val = int(num_match_valid.group(1))
        d_val = int(num_match_valid.group(2))
        y_val = num_match_valid.group(3)[-2:]
        return f"{m_val:02d}{d_val:02d}{y_val}", True

    num_match_trunc = re.search(r"(\d{1,2})[-/](\d{1,2})[-/](\d{3})\b", cleaned)
    if num_match_trunc:
        m_val = int(num_match_trunc.group(1))
        d_val = int(num_match_trunc.group(2))
        y_val = num_match_trunc.group(3)[-2:]
        return cleaned, False

    num_match_2 = re.search(r"(\d{1,2})[-/](\d{1,2})", cleaned)
    if num_match_2:
        m_val = int(num_match_2.group(1))
        d_val = int(num_match_2.group(2))
        # Preserve incomplete handwriting verbatim for human review.
        return cleaned, False

    digits_only = re.sub(r"\D", "", cleaned)
    if len(digits_only) == 6 and len(cleaned.strip()) == 6:
        return digits_only, True

    return cleaned, False

def parse_tube_table_data(unique_texts: dict, assay_choice: str, assay_conf: float, resolved_passage: int, passage_conf: float):
    sample_id = {"value": "N/A", "confidence": 0.0}
    date_sampled = {"value": "N/A", "confidence": 0.0}
    date_received = {"value": datetime.now().strftime("%m%d%y"), "confidence": 1.0}
    machine = {"value": "N/A", "confidence": 0.0}
    serial_number = {"value": "N/A", "confidence": 0.0}
    component = {"value": "N/A", "confidence": 0.0}
    ref_lube = {"value": "N/A", "confidence": 0.0}

    tube_type = "Small"

    for text in unique_texts.keys():
        if re.search(r"\b(Equip\s*(?:ID|1D|lD|lo|DS)?|Sample\s*Point|Ref\s*Lube|Ret\s*Lube|Rei\s*Lube|Lab\s*ID)\b", text, re.IGNORECASE):
            tube_type = "Large"
            break

    machine_candidates = []
    sn_candidates = []
    date_candidates = []

    for text, entry in unique_texts.items():
        conf = entry["confidence"]
        clean = text.strip()

        # Sample ID
        lab_id_match = re.search(r"Lab\s*(?:ID|1D|lD)\s*[:\-]?\s*(\d{4,8})", clean, re.IGNORECASE)
        if lab_id_match:
            sid_val = lab_id_match.group(1)
            if conf > sample_id["confidence"]:
                sample_id = {"value": sid_val, "confidence": conf}
        elif re.fullmatch(r"\d{5,8}", clean):
            if conf > sample_id["confidence"]:
                sample_id = {"value": clean, "confidence": conf}

        # Date Sampled
        alpha_date = re.search(rf"\b(\d{{1,2}}\s*[-/]?\s*{MONTH_REGEX}\s*[-/]?\s*\d{{0,4}})\b", clean, re.IGNORECASE)
        numeric_date = re.search(r"Date\s*[:\-]?\s*([0-9gq]{1,2}[-/][0-9]{1,2}(?:[-/][0-9a-zA-Z]{2,4})?)", clean, re.IGNORECASE)
        if not numeric_date:
            numeric_date = re.search(r"\b([0-9gq]{1,2}[-/][0-9]{1,2}(?:[-/][0-9a-zA-Z]{2,4})?)\b", clean)

        if alpha_date:
            norm_d, is_complete = normalize_to_mmddyy(alpha_date.group(1))
            effective_conf = conf if is_complete else min(0.49, conf)
            date_candidates.append((norm_d, effective_conf))
        elif numeric_date:
            norm_d, is_complete = normalize_to_mmddyy(numeric_date.group(1))
            effective_conf = conf if is_complete else min(0.49, conf)
            date_candidates.append((norm_d, effective_conf))

        # Machine
        if tube_type == "Large":
            equip_match = re.search(r"Equip\s*(?:ID|1D|lD|lo|DS)\s*[:#\-]?\s*(.+)", clean, re.IGNORECASE)
            if equip_match:
                val = equip_match.group(1).strip()
                val = re.split(r"\s+(?:Date|Sample|Ref|Ret|Rei)\b", val, flags=re.IGNORECASE)[0].strip()
                val = val.strip(" :#-\t")
                if val and val.upper() != "MRG":
                    effective_conf = max(0.0, conf - 0.15) if len(val) <= 2 else conf
                    machine_candidates.append((val, effective_conf))
        else:
            if not clean.upper().startswith("SN:"):
                rn_match = re.search(r"(?:RN\s*[:\-]?)?\s*\b(UP\s*\d{3,5})\b", clean, re.IGNORECASE)
                if rn_match:
                    val = rn_match.group(1).strip()
                    val = re.sub(r"^UP(\d)", r"UP \1", val, flags=re.IGNORECASE)
                    machine_candidates.append((val, conf))
                elif clean.upper().startswith("RN:"):
                    raw_val = re.sub(r"^RN\s*[:\-]?", "", clean, flags=re.IGNORECASE).strip()
                    raw_val = re.split(r"\s+(?:Date|Sample)\b", raw_val, flags=re.IGNORECASE)[0].strip()
                    raw_val = raw_val.strip(" :#-\t")
                    if raw_val:
                        machine_candidates.append((raw_val, conf))

        # Serial Number
        if tube_type == "Small":
            sn_prefixed = re.search(r"\bSN\s*[:\-]?\s*([A-Za-z0-9\-_.]+)", clean, re.IGNORECASE)
            if sn_prefixed:
                val = sn_prefixed.group(1).strip().strip(" :#-\t")
                if val.upper() not in ["UP", "GS", "NGS"] and not re.fullmatch(r"\d{5,8}", val):
                    sn_candidates.append((val, conf))
            elif re.fullmatch(r"[A-Za-z]{2,3}\d{6,9}", clean):
                sn_candidates.append((clean, conf))

        # Large Tube Component & Ref Lube
        if tube_type == "Large":
            sp_match = re.search(r"Sample\s*Point\s*[:\-]?\s*(.+)", clean, re.IGNORECASE)
            if sp_match:
                val = sp_match.group(1).strip().strip(" :#-\t")
                if conf > component["confidence"] and len(val) > 2:
                    component = {"value": val, "confidence": conf}

            lube_match = re.search(r"Re[tfli]\s*Lube\s*[:\-]?\s*(.+)", clean, re.IGNORECASE)
            if lube_match:
                val = lube_match.group(1).strip().strip(" :#-\t")
                if conf > ref_lube["confidence"] and len(val) > 2:
                    ref_lube = {"value": val, "confidence": conf}

    if date_candidates:
        best_date = max(date_candidates, key=lambda x: x[1])
        date_sampled = {"value": best_date[0], "confidence": round(best_date[1], 3)}

    if machine_candidates:
        best_mach = max(machine_candidates, key=lambda x: x[1])
        machine = {"value": best_mach[0], "confidence": round(best_mach[1], 3)}

    if tube_type == "Small":
        if sn_candidates:
            best_sn = max(sn_candidates, key=lambda x: x[1])
            serial_number = {"value": best_sn[0], "confidence": round(best_sn[1], 3)}
        ref_lube = {"value": "[Leave Blank]", "confidence": 1.0}

        parts = []
        conf_vals = []
        if resolved_passage is not None:
            parts.append(str(resolved_passage))
            conf_vals.append(passage_conf)
        if assay_choice:
            parts.append(assay_choice)
            conf_vals.append(assay_conf)

        if parts:
            component = {
                "value": " ".join(parts),
                "confidence": round(float(np.mean(conf_vals)), 3)
            }
    else:
        serial_number = {"value": "[Leave Blank]", "confidence": 1.0}

    return tube_type, {
        "Sample ID": sample_id,
        "Date Sampled": date_sampled,
        "Date Received": date_received,
        "Machine": machine,
        "Component": component,
        "Serial Number": serial_number,
        "Reference Lube": ref_lube
    }

# ---------------------------------------------------------
# Step 4: Pipeline Execution & Diagnostic Logging
# ---------------------------------------------------------
def process_tube_video(video_path: str, output_dir: str = "extracted_ocr_frames"):
    total_start_time = time.perf_counter()

    print(f"\n=======================================================")
    print(f"Loading and processing: {video_path}")
    print(f"=======================================================")
    os.makedirs(output_dir, exist_ok=True)
    debug_crop_dir = os.path.join(output_dir, "debug_crops")
    os.makedirs(debug_crop_dir, exist_ok=True)

    kf_start_time = time.perf_counter()
    keyframes = extract_best_keyframes(video_path, top_k=8)
    kf_duration = time.perf_counter() - kf_start_time
    print(f"Selected {len(keyframes)} distributed sharp keyframes across video duration in {kf_duration:.3f}s.\n")

    accumulated_results = []
    gs_scores_all = []
    ngs_scores_all = []
    unicode_passages = []
    contour_passages = []

    ocr_start_time = time.perf_counter()
    per_frame_durations = []

    for rank, (frame_idx, score, frame) in enumerate(keyframes):
        frame_t0 = time.perf_counter()
        frame_filename = os.path.join(output_dir, f"frame_{rank}_id{frame_idx}.jpg")
        cv2.imwrite(frame_filename, frame)

        if paddle.device.is_compiled_with_cuda():
            paddle.device.cuda.synchronize()

        res = get_ocr().predict(frame)

        if paddle.device.is_compiled_with_cuda():
            paddle.device.cuda.synchronize()

        if not res:
            per_frame_durations.append(time.perf_counter() - frame_t0)
            continue

        data = res[0]
        texts = data.get("rec_texts", [])
        scores = data.get("rec_scores", [])
        # rec_* arrays align after PaddleOCR's recognition-score filtering.
        # dt_polys can contain extra boxes and mislabel annotations.
        polys = data.get("rec_polys")
        if polys is None:
            polys = data.get("dt_polys")
        if polys is None:
            polys = []

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
                unicode_passages.append((num, float(conf)))

            # 2. Geometric Passage Contour Evaluation
            if poly is not None and (re.search(r"[1-6]", clean_text) or any(d in clean_text for d in "123456")):
                best_d, d_score = analyze_passage_enclosure(active_img, poly, frame_idx, debug_crop_dir)
                if d_score > 0.40:
                    contour_passages.append((best_d, d_score))

            # 3. Dual-Region Assay Analysis (Evaluates both GS & NGS regardless of which text OCR spotted)
            upper_t = clean_text.upper()
            if poly is not None and ("GS" in upper_t or "NGS" in upper_t):
                gs_sc, ngs_sc = analyze_assay_enclosure(active_img, poly, upper_t, frame_idx, debug_crop_dir)
                gs_scores_all.append(gs_sc)
                ngs_scores_all.append(ngs_sc)

            accumulated_results.append({
                "frame_index": frame_idx,
                "text": clean_text,
                "confidence": round(float(conf), 3),
                "saved_frame": frame_filename
            })

        if words_found_in_frame:
            annotated_filename = os.path.join(output_dir, f"frame_{rank}_id{frame_idx}_annotated.jpg")
            cv2.imwrite(annotated_filename, annotated)

        per_frame_durations.append(time.perf_counter() - frame_t0)

    ocr_duration = time.perf_counter() - ocr_start_time

    unique_texts = {}
    for entry in accumulated_results:
        t = entry["text"]
        if t not in unique_texts or entry["confidence"] > unique_texts[t]["confidence"]:
            unique_texts[t] = entry

    print("\n================ OCR Readings ================")
    for text, d in sorted(unique_texts.items(), key=lambda x: x[1]["confidence"], reverse=True):
        print(f"[{d['confidence']:.3f}] {text} (Frame {d['frame_index']} -> {d['saved_frame']})")

    # Resolve Assay (GS vs NGS) with Diagnostic Logging
    mean_gs = float(np.mean(gs_scores_all)) if gs_scores_all else 0.0
    mean_ngs = float(np.mean(ngs_scores_all)) if ngs_scores_all else 0.0
    print(f"\n================ Assay Decision Diagnostic ================")
    print(f"Overall GS Score: {mean_gs:.3f} | Overall NGS Score: {mean_ngs:.3f}")
    if mean_gs > mean_ngs:
        chosen_assay = "GS"
        assay_conf = round(min(1.0, 0.85 + (mean_gs - mean_ngs) * 0.1), 3)
        print(f"Result -> Chosen: GS (Score difference: +{mean_gs - mean_ngs:.3f})")
    elif mean_ngs > mean_gs:
        chosen_assay = "NGS"
        assay_conf = round(min(1.0, 0.85 + (mean_ngs - mean_gs) * 0.1), 3)
        print(f"Result -> Chosen: NGS (Score difference: +{mean_ngs - mean_gs:.3f})")
    else:
        chosen_assay = None
        assay_conf = 0.0
        print("Result -> Indeterminate Assay Choice")

    # Resolve Passage Digit with Diagnostic Logging
    print(f"\n================ Passage Decision Diagnostic ================")
    resolved_passage = None
    passage_conf = 0.85
    if unicode_passages:
        counts = Counter([p[0] for p in unicode_passages])
        resolved_passage = counts.most_common(1)[0][0]
        matching_confs = [p[1] for p in unicode_passages if p[0] == resolved_passage]
        passage_conf = float(np.mean(matching_confs))
        print(f"Result -> Chosen from Unicode glyph: {resolved_passage} (Votes: {dict(counts)})")
    elif contour_passages:
        # Sum candidate scores across frames
        digit_totals = Counter()
        for d, sc in contour_passages:
            digit_totals[d] += sc
        resolved_passage = digit_totals.most_common(1)[0][0]
        passage_conf = 0.90
        print(f"Result -> Chosen from Contour Voting: {resolved_passage} (Aggregated scores: {dict(digit_totals)})")
    else:
        print("Result -> No passage number detected")

    tube_type, table_row = parse_tube_table_data(
        unique_texts,
        chosen_assay,
        assay_conf,
        resolved_passage,
        passage_conf
    )

    total_duration = time.perf_counter() - total_start_time
    avg_frame_time = float(np.mean(per_frame_durations)) if per_frame_durations else 0.0

    print("\n" + "=" * 115)
    print(" " * 42 + "LABORATORY DATA RECORD")
    print("=" * 115)

    header_str = f"{'Type':<8} | {'Sample ID':<13} | {'Date Sampled':<14} | {'Date Received':<14} | {'Machine':<13} | {'Component':<15} | {'Serial Number':<16} | {'Ref Lube':<12}"
    print(header_str)
    print("-" * 115)

    values_str = (
        f"{tube_type:<8} | "
        f"{table_row['Sample ID']['value']:<13} | "
        f"{table_row['Date Sampled']['value']:<14} | "
        f"{table_row['Date Received']['value']:<14} | "
        f"{table_row['Machine']['value']:<13} | "
        f"{table_row['Component']['value']:<15} | "
        f"{table_row['Serial Number']['value']:<16} | "
        f"{table_row['Reference Lube']['value']:<12}"
    )
    print(values_str)

    conf_str = (
        f"{'Conf:':<8} | "
        f"{table_row['Sample ID']['confidence']:<13.3f} | "
        f"{table_row['Date Sampled']['confidence']:<14.3f} | "
        f"{table_row['Date Received']['confidence']:<14.3f} | "
        f"{table_row['Machine']['confidence']:<13.3f} | "
        f"{table_row['Component']['confidence']:<15.3f} | "
        f"{table_row['Serial Number']['confidence']:<16.3f} | "
        f"{table_row['Reference Lube']['confidence']:<12.3f}"
    )
    print(conf_str)
    print("=" * 115)

    print("\n" + "=" * 45)
    print("           PERFORMANCE TIMING")
    print("=" * 45)
    print(f"Keyframe Extraction ({len(keyframes)} frames) : {kf_duration:.3f} s")
    print(f"GPU OCR Inference & Enclosure: {ocr_duration:.3f} s")
    print(f"Average Latency Per Keyframe : {avg_frame_time:.3f} s")
    print(f"Total Pipeline Runtime       : {total_duration:.3f} s")
    print("=" * 45 + "\n")

    return {
        "tube_type": tube_type,
        "table_row": table_row,
        "raw_ocr": unique_texts,
        "timing": {
            "keyframe_duration_sec": round(kf_duration, 3),
            "ocr_duration_sec": round(ocr_duration, 3),
            "avg_frame_latency_sec": round(avg_frame_time, 3),
            "total_duration_sec": round(total_duration, 3)
        }
    }

if __name__ == "__main__":
    video_file = "VID_20261106_231515.mp4"
    if os.path.exists(video_file):
        results = process_tube_video(video_file, output_dir="extracted_ocr_frames")
    else:
        fallback = "IMG_1880.mp4"
        if os.path.exists(fallback):
            print(f"'{video_file}' not found. Falling back to '{fallback}'.")
            results = process_tube_video(fallback, output_dir="extracted_ocr_frames")
        else:
            print(f"Error: Could not find '{video_file}' or '{fallback}'.")