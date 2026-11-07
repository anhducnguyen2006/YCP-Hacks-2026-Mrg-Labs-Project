import os
import cv2
import numpy as np
from paddleocr import PaddleOCR

# Force CPU to avoid CUDA DLL issues
ocr = PaddleOCR(use_angle_cls=True, lang='en', device='gpu')

def get_laplacian_sharpness(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return cv2.Laplacian(gray, cv2.CV_64F).var()

def test_single_video(video_path: str, top_k: int = 6):
    os.makedirs("debug_frames", exist_ok=True)
    
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error: Could not open {video_path}")
        return

    frames = []
    idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        score = get_laplacian_sharpness(frame)
        frames.append((idx, score, frame))
        idx += 1
    cap.release()

    # Sort by sharpness, pick distributed frames
    sorted_frames = sorted(frames, key=lambda x: x[1], reverse=True)
    selected = []
    for f_idx, score, frame in sorted_frames:
        if all(abs(f_idx - s[0]) >= 8 for s in selected):
            selected.append((f_idx, score, frame))
        if len(selected) >= top_k:
            break

    selected.sort(key=lambda x: x[0])
    print(f"Sampled {len(selected)} frames from {video_path}.")

    for rank, (f_idx, score, frame) in enumerate(selected):
        # 1. Save frame to disk for visual inspection
        filename = f"debug_frames/frame_{rank}_idx{f_idx}.jpg"
        cv2.imwrite(filename, frame)
        print(f"\n================ Frame {rank} (Frame ID: {f_idx}) ================")
        print(f"Saved: {filename} (Sharpness: {score:.2f})")

        # 2. Run inference directly on the raw image
        raw_output = ocr.ocr(frame)
        print("Raw Model Output Structure:")
        print(raw_output)

if __name__ == "__main__":
    test_video = "IMG_1880.mp4"
    test_single_video(test_video)