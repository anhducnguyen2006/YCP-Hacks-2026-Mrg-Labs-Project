# MRG Sample Scanner

MRG Sample Scanner digitizes short rotation videos of cylindrical laboratory sample labels.

## Current implementation

- React + Mantine workspaces: Batches, Scan, Samples, Review, Templates, Settings.
- FastAPI endpoints for batches, uploads, queued analysis, saved sample fields, manual corrections, and media.
- PostgreSQL persistence, Redis/RQ background job, shared media volume.
- **Experimental selected-frame extraction:** OpenCV scans a short video locally, selects up to 8 sharp frames distributed across the rotation, and sends them together to Gemini in **one API request per sample**.
- Gemini returns a compact seven-field extraction; the worker adds the batch receiving date and requires human review of AI-read fields.
- Review includes source video and a saved keyframe. The frontend currently previews the first keyframe; additional selected frames remain available via the media API.
- Template page downloads a **blank** CSV, not real sample results. Export of reviewed samples is not implemented yet.
- Live capture, automated character-level accuracy and 800-sample concurrency/rate-limiting are **not yet implemented**.

This branch is an integration MVP, not an accuracy-tested production system.

## Setup

Requires Docker Desktop and a Gemini API key.

1. Create a private local environment file:
   ```bash
   cp .env.example .env
   ```
2. Add your own key to `.env` as `GEMINI_API_KEY=...`; never put it in source code, commits, screenshots or issue threads.
3. Start the stack:
   ```bash
   docker compose up --build
   ```
4. Open http://localhost:5173. API docs: http://localhost:8000/docs.
5. From **Scan**, create a batch, choose a short MOV/MP4/WebM tube video (50 MB maximum), click **Upload to batch**, then **Analyze label**. Wait while RQ runs locally; Review displays the extracted fields and selected keyframe.

**Important:** Stop the old or temporary project's services first if ports 5173, 8000, 5432 or 6379 are occupied. This repo's .env must be used from the repo root. Container paths use the shared `sample_media` Docker volume.

## Extraction configuration

```env
GEMINI_MODEL=gemini-3.6-flash
GEMINI_THINKING_LEVEL=minimal
SELECTED_FRAME_COUNT=8
```

Frame selection is local. No Gemini API calls are made until **Analyze label** is clicked. The configured model can be changed if your account supports another model.

The backend decodes up to 32 candidate frames using OpenCV and chooses the sharpest frame in each of 8 evenly distributed time bins. This method preserves coverage across the full rotation but does **not** guarantee a complete label view. Camera focus, glare, label curvature, and handwriting can still cause mistakes. The worker stores all selected frames, maintains record IDs as strings, and uses the batch receiving date rather than asking Gemini to infer it.

**Critical quality warning:** Earlier one-video tests on the separate temporary prototype showed inaccurate serial numbers from single-pass inference. This branch has not been verified against a real sample; do not assume serial numbers are correct without technician verification.

## Tests

```bash
docker compose run --rm api pytest
docker compose run --rm api ruff check app tests
cd frontend
npm install
npm run typecheck
npm run lint
npm run test
npm run build
```

Backend unit tests use synthetic images and do not call Gemini. A real end-to-end video test requires a configured API key and a manually verified sample recording.

## Architecture

- `frontend/src/api.ts`: typed backend client; maintains the existing frontend API contract.
- `frontend/src/features/scan/ScanPage.tsx`: upload and analysis flow.
- `frontend/src/features/review/ReviewPage.tsx`: media inspection and manual review.
- `backend/app/main.py`: HTTP and persistence boundary.
- `backend/app/frame_selection.py`: OpenCV selection, local only.
- `backend/app/gemini_frames.py`: one Gemini request with selected images.
- `backend/app/jobs.py`: RQ worker, writes results and selected JPEGs.
- `backend/app/models.py`: SQLAlchemy domain models.
- `backend/alembic/versions/`: schema migration.
- `docker-compose.yml`: PostgreSQL, Redis, API, worker, and frontend.

See `AGENTS.md` for the exact seven-column CSV field mapping.
