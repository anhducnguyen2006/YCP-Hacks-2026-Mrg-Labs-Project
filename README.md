# MRG Sample Scanner

MRG Sample Scanner digitizes short rotation videos of cylindrical laboratory sample labels.

## Current implementation

- React + Mantine workspaces: Batches, Scan, Samples, Review, Templates & Export, Settings.
- FastAPI HTTP API backed by PostgreSQL; media stored on the shared Docker volume.
- Redis/RQ worker performs local frame extraction and sends up to eight selected images to Gemini in one request per sample.
- Scan supports single-video upload/analysis **and** drag-and-drop multi-video intake (up to 800 videos, 50 MB each, two concurrent uploads). Bulk uploads automatically enqueue analysis. Keep the browser page open until upload requests finish; already queued analyses continue in the worker.
- Review: click a sample row to open the source video, all selected frame thumbnails, original/extracted values, and editable fields in a modal.
- Review signals: green = human verified, yellow = needs verification, red = Gemini flagged ambiguity, gray = not applicable or no review required. **These are workflow signals, not calibrated model confidence percentages.**
- Templates & Export: download either a blank seven-column template or real CSV records for a selected batch, including pages beyond the first 50. Exports use current corrected values; optional reviewed-only filter.
- Each newly analyzed sample receives a Gemini-reported **high / medium / low** overall visual-confidence rating and a short explanation from the same inference request. This is subjective and **not a calibrated accuracy probability**. Already analyzed samples retain a null/unrated value; no automatic reanalysis.
- The Samples page now supports batch-wide search, sort, confidence/status filtering, page selection, and confirmed removal of inactive samples. Deletion removes database records and their local sample-media directory. It is irreversible.
- Live camera scanning, reliable resumable browser uploads, and full 800-sample throughput/accuracy validation are **not yet implemented**.

This branch remains an integration MVP, not a production-validated scanner. Verify all AI-read fields.

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
5. From **Scan**, create or select a batch, then either drop several MOV/MP4/WebM videos into the bulk uploader and select **Upload & analyze**, or use the manual single-video upload/analyze controls. From **Review**, click any sample row to inspect and edit it. **Templates & Export** downloads the completed sample records.

**Important:** Stop the old or temporary project's services first if ports 5173, 8000, 5432 or 6379 are occupied. This repo's .env must be used from the repo root. Container paths use the shared `sample_media` Docker volume.

## Extraction configuration

```env
GEMINI_MODEL=gemini-3.6-flash
GEMINI_THINKING_LEVEL=minimal
SELECTED_FRAME_COUNT=8
```

Frame selection is local. Gemini is called only when analysis is queued (automatically by bulk upload or manually by the single-video workflow). The configured model can be changed if your account supports another model.

The backend decodes up to 32 candidate frames using OpenCV and chooses the sharpest frame in each of 8 evenly distributed time bins. This method preserves coverage across the full rotation but does **not** guarantee a complete label view. Camera focus, glare, label curvature, and handwriting can still cause mistakes. The worker stores all selected frames, maintains record IDs as strings, and uses the batch receiving date rather than asking Gemini to infer it.

**Critical quality warning:** Real sample videos have been tested, including a five-sample walkthrough, but handwriting and dates can still be misread (for example, year digits). These limited tests do not establish statistical accuracy. Technician verification remains mandatory.

## Tests

```bash
docker compose run --rm api pytest
docker compose run --rm api ruff check app tests
cd frontend
npm ci
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

## Confidence interpretation

Gemini reports one overall rating per sample in its existing selected-frame request, so there is no second inference call. High means clear, consistent readings across the applicable fields; medium means some visual ambiguity; low means important unreadable or contradictory text. A high rating is **not proof that any character is correct**. Calibrate these categories against technician-reviewed samples before relying on them for automatic acceptance. Dates received from the batch and inapplicable fields do not affect the rating. Older completed records are shown as **Not rated** and are never rescanned automatically.

## Inventory

Choose a batch in Samples to search and sort across the full batch, filter by AI confidence or processing status, select rows, and inspect/edit an individual record through Review. Deleting selected records requires confirmation and is refused if any selected sample has an active or queued analysis job. Exports previously downloaded are unaffected. Saved media is removed when record deletion succeeds. Keep backups if audit retention is necessary.
