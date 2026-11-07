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

The automated suite mocks Gemini and does not claim a real Gemini extraction. Inspect failures with `docker compose logs -f api worker`.

See [docs/architecture.md](docs/architecture.md) for boundaries, data flow, and decisions.
