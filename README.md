# MRG Sample Scanner

MRG Sample Scanner is a local-first laboratory application for digitizing cylindrical grease/oil sample labels. Technicians will record a short rotation video, flatten the label with [spin-scan](https://github.com/adamplabarge/spin-scan), extract structured fields, review uncertain values, and export selected samples.

The current vertical slice supports persistent batches, recorded-video upload, server-side media validation, RQ processing, Gemini structured extraction, representative keyframes, and immediate field correction. The History tab, live camera recording, advanced review dashboard, custom schema editor, and CSV export are intentionally not implemented yet.

## Prerequisites

- Docker Desktop with Compose
- Node.js 20+ and npm 10+ for local frontend work
- Python 3.12+ and `uv` or `pip` for local backend work

## Start with Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Open [http://localhost:5173](http://localhost:5173). The API health check is at [http://localhost:8000/api/health](http://localhost:8000/api/health).

## Local development

```bash
# Infrastructure
docker compose up postgres redis

# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

## Validation

```bash
cd frontend
npm run typecheck
npm run lint
npm run test
npm run build

cd ../backend
pytest
```

## Test a real sample video

1. Add a real key to `.env` as `GEMINI_API_KEY=...` and optionally choose `GEMINI_MODEL` and `GEMINI_VIDEO_FPS=5` or `10`.
2. Restart the backend services so the key is injected:

   ```bash
   docker compose up --build -d api worker frontend
   ```

3. Open `http://localhost:5173`, create a batch, choose it on **Scan**, upload an MP4/MOV/WebM clip (2–3 seconds recommended), and click **Analyze with Gemini**.
4. Wait for the worker status to complete. The original video, representative frame, detected label type, seven fields, and editable values will be shown.

Run controlled provider diagnostics from the worker image:

```bash
docker compose run --rm worker python scripts/test_gemini.py models
docker compose run --rm worker python scripts/test_gemini.py text
docker compose run --rm -v "$(pwd)/test_video:/tmp/test_video:ro" worker \
  python scripts/test_gemini.py frames /tmp/test_video/IMG_1880.MOV
docker compose run --rm -v "$(pwd)/test_video:/tmp/test_video:ro" worker \
  python scripts/test_gemini.py video /tmp/test_video/IMG_1880.MOV
```

`GEMINI_INPUT_MODE=frames` is the current default because the tested direct-video endpoint is provider-overloaded. It extracts up to 12 chronological, high-resolution JPEG frames and submits them in one multimodal request. Set `GEMINI_INPUT_MODE=video` to retain direct video, or `auto` to try direct video and then use the remaining retry budget for frames after transient video failures.

The application uses a single bounded Gemini inference retry budget. A provider-side 503 is persisted as a failed processing job after that budget is exhausted; it is not reported as a successful extraction.

The automated suite mocks Gemini and does not claim a real Gemini extraction. Inspect failures with `docker compose logs -f api worker`.

See [docs/architecture.md](docs/architecture.md) for boundaries, data flow, and decisions.
