FROM python:3.12-slim

# Install system dependencies needed by PaddlePaddle and OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    libgl1 \
    libglib2.0-0 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency definition
COPY pyproject.toml .

# CPU is portable, including Docker Desktop on macOS.
# NVIDIA-only hosts can opt in with the GPU compose override.
ARG OCR_ENGINE=cpu
RUN pip install --no-cache-dir ".[dev]" && \
    if [ "$OCR_ENGINE" = "gpu" ]; then \
      pip uninstall -y paddlepaddle && \
      pip install --no-cache-dir paddlepaddle-gpu; \
    fi

# Copy application source
COPY alembic.ini .
COPY alembic ./alembic
COPY tests ./tests
COPY app ./app