# OCR deployment and confidence contract

GreaseFreeData's new local PaddleOCR worker is **not Gemini**. The CPU
configuration is for compatibility and is **not** expected to match the
2-second NVIDIA-GPU benchmark.

## On Docker Desktop (macOS or ordinary Linux CPU)

From the repository root:

```sh
git fetch origin
git switch fix/ocr-integration-confidence
docker compose build api worker
docker compose up -d api worker
docker compose ps
```

`OCR_DEVICE=cpu` is the default. On Apple Silicon, `OCR_DOCKER_PLATFORM`
defaults to `linux/amd64` for greater PyPI wheel compatibility, at the cost
of running under emulation. Native ARM support depends on published
PaddlePaddle wheels; building and startup must be verified on your machine.

## On Linux with an NVIDIA CUDA driver + NVIDIA Container Toolkit

```sh
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

The GPU override requests NVIDIA access and installs GPU PaddlePaddle in
the worker only. GPU availability, CUDA/cuDNN version, and PaddlePaddle
wheel compatibility **must** be checked on the target host before production.
The app/API continues using the CPU image.

## Data quality contract

- `Date Sampled`: OCR's MMDDYY value becomes YYYY-MM-DD; malformed or
  incomplete strings are preserved for an explicit review warning, never
  silently repaired. YY uses a stated century pivot; humans still verify.
- `Date Received`: always comes from the batch metadata.
- Small-tube Reference Lube and large-tube Serial Number remain inapplicable.
- Missing optional Serial Number/Reference Lube values stay blank without
  falsely claiming there was unreadable handwriting.
- Required fields missing, invalid dates, and low OCR text scores prompt
  review. Scores are *OCR model estimates*, **not measured accuracy**.
- Manual edits never overwrite the original `predicted_value`.
- Keyframes from the current attempt are stored under a job-specific
  directory so retries do not overwrite earlier evidence.
- Retained Gemini quota endpoints can be deprecated separately; no Gemini
  API call is required by the new inference worker.

## Validation before merge

```sh
docker compose build api worker
docker compose run --rm --no-deps api pytest -q
docker compose run --rm --no-deps api ruff check app tests
cd frontend && npm test && npm run build
```

The live pipeline must also be smoke-tested on real small and large labels,
including a missing SN, ambiguous year, and a retried sample; neither CI nor
these commands independently establish real OCR accuracy.
