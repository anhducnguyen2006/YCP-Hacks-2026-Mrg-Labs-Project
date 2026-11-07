# MRG Sample Scanner

MRG Sample Scanner digitizes short rotation videos of cylindrical laboratory sample labels.

## Current implementation

- React + Mantine researcher workspace: Scan, Samples, Export, Settings, plus a header Help guide.
- FastAPI HTTP API backed by PostgreSQL; media stored on the shared Docker volume.
- Redis/RQ worker performs local frame extraction and sends up to eight selected images to Gemini in one request per sample.
- Scan supports single-video upload/analysis **and** drag-and-drop multi-video intake (up to 800 videos, 50 MB each, two concurrent uploads). Bulk uploads automatically enqueue analysis. Keep the browser page open until upload requests finish; already queued analyses continue in the worker.
- Samples: click a row to open the source video, all selected frame thumbnails, original/extracted values, and inline editable fields in a modal. The former Review page redirects to Samples for saved links.
- Review signals: green = human verified, yellow = needs verification, red = Gemini flagged ambiguity, gray = not applicable or no review required. **These are workflow signals, not calibrated model confidence percentages.**
- Export: download real completed CSV records for a selected batch from the primary action card. A blank seven-column template and label mapping are available as secondary reference information.
- Each newly analyzed sample receives a Gemini-reported **high / medium / low** overall visual-confidence rating and a short explanation from the same inference request. This is subjective and **not a calibrated accuracy probability**. Already analyzed samples retain a null/unrated value; no automatic reanalysis.
- The Samples page now supports batch-wide search, sort, confidence/status filtering, page selection, and confirmed removal of inactive samples. Deletion removes database records and their local sample-media directory. It is irreversible.
- Live camera scanning, reliable resumable browser uploads, and full 800-sample throughput/accuracy validation are **not yet implemented**.

This branch remains an integration MVP, not a production-validated scanner. Verify all AI-read fields.

## Setup (Windows / PowerShell)

These instructions describe `feat/researcher-workspace-simplification`. Other branches, including `main`, may contain an older interface or backend. Select this branch in GitHub's branch dropdown when reading its files.

### 1. Prerequisites

- Install Git and Docker Desktop. Start Docker Desktop and wait until its engine is running with Linux containers enabled.
- Have a Gemini API key with access and quota for the configured model. Only the backend/worker uses this key.
- Node.js and Python installations on your laptop are **not required for the Docker setup**; the images install their own runtimes.

Check Docker from a PowerShell terminal:

```powershell
docker version
docker compose version
```

### 2. Get the correct branch

For a new checkout, run these commands from the folder where you want to keep the project:

```powershell
git clone --branch feat/researcher-workspace-simplification --single-branch https://github.com/anhducnguyen2006/YCP-Hacks-2026-Mrg-Labs-Project.git
cd YCP-Hacks-2026-Mrg-Labs-Project
```

For an existing checkout, open its folder in VS Code and open **Terminal → New Terminal**. For this laptop's existing workspace:

```powershell
cd D:\Downloads\MCP_Hackathon_MRG_Labs
git status
git fetch origin
git switch feat/researcher-workspace-simplification
git pull --ff-only origin feat/researcher-workspace-simplification
```

If the local branch does not exist, use `git switch --track origin/feat/researcher-workspace-simplification` instead. Preserve any local changes before switching; do not discard them to get past a Git warning. Confirm `git branch --show-current` prints `feat/researcher-workspace-simplification`.

### 3. Create the private environment file

Run from the repository root (the folder containing `docker-compose.yml`). This command preserves an existing `.env`:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Open `.env` in VS Code and fill in your own key:

```dotenv
GEMINI_API_KEY=YOUR_OWN_KEY_HERE
```

Save the file. Never commit or share `.env`, keys, or screenshots containing them. Do not use a `VITE_*` variable for a secret: those variables are included in browser code. Keep the other example settings unless you deliberately need to change them. The checked-in model name is a configuration default, not a guarantee that your Gemini account can use it.

### 4. Build and start the services

```powershell
docker compose up -d --build
docker compose ps
```

The first build downloads images and dependencies and can take several minutes. Normal progress includes `Pulling`, `Downloading`, `RUN npm install`, and `RUN pip install`. A final `ERROR` or `failed to solve` means the build did not complete.

The stack starts PostgreSQL, Redis, API, worker, and frontend. The API applies database migrations automatically at startup. PostgreSQL and Redis should report healthy; the other services should remain running.

`frontend/.dockerignore` excludes your laptop's `node_modules`, build output, and environment files. Keep this file: the frontend image must install its own Linux dependencies instead of copying local dependencies into the container.

### 5. Verify and open the app

```powershell
Invoke-RestMethod http://localhost:8000/api/health
Invoke-RestMethod http://localhost:8000/api/batches
```

The health response should contain `status: ok`. The batches endpoint should return a list (possibly empty). A health response alone does not verify Gemini access or extraction accuracy.

- App: [http://localhost:5173](http://localhost:5173/)
- API documentation: [http://localhost:8000/docs](http://localhost:8000/docs)

Use port **5173** for this Docker setup. Port **5174** was a separate development preview and is not the Docker app. Use **Ctrl+Shift+R** if your browser still shows an older interface.

### 6. Use the researcher workflow

1. **Scan:** create or select a batch and set its receiving date. To change the default export filename for new batches, save that preference in **Settings** before creating the batch.
2. Start with one short, readable MOV/MP4/WebM tube video (up to 50 MB). Under single-video controls, choose **Upload to batch**, then **Analyze label**. The worker selects frames locally and sends selected images to Gemini.
3. **Samples:** select the batch, then click a sample row to inspect its original video and selected frames. Correct and save uncertain fields in the detail window. Live camera capture is not connected.
4. **Export:** select the batch and download its completed records. Enable **Export only samples with no outstanding field reviews** to omit completed records that still have flagged fields. With this option off, completed but unverified readings can be exported. The blank template is a separate reference download.
5. For multiple videos, use Scan's bulk uploader and **Upload & analyze**. Bulk upload queues analysis automatically; keep the browser open until uploads finish. Start small before attempting large batches.

The CSV has exactly seven headers in this order: `Sample ID`, `Date Sampled`, `Date Received`, `Machine`, `Component`, `Serial Number`, `Refrence Lube`. The final header intentionally matches the supplied template's spelling. Blank/inapplicable fields remain empty; identifiers remain strings.

### Stop, restart, and update

```powershell
# Stop services without deleting the saved volumes.
docker compose stop

# Start the existing containers again.
docker compose start

# After updating the code or .env, rebuild/recreate services.
docker compose up -d --build
```

For future code updates on this branch, check `git status`, then run `git pull --ff-only origin feat/researcher-workspace-simplification` and rebuild. An already-built container does not automatically pick up Git changes.

Records persist in the `postgres_data` volume, uploaded videos/frames in `sample_media`, and Redis state in `redis_data`. Avoid `docker compose down -v` unless you intentionally want to delete this stack's volumes and stored data. Do not change the database credentials in an existing installation without migrating the database configuration.

### Troubleshooting

| Symptom | What to check |
| --- | --- |
| Docker engine / named-pipe connection error | Start Docker Desktop and wait until `docker version` can reach its server. |
| `cannot replace ... /app/node_modules/... with file` during `COPY . .` | Make sure `frontend/.dockerignore` exists and includes `node_modules`, then rebuild. Do not delete your sample/database volumes. |
| Port already allocated | Ports 5173, 8000, 5432, or 6379 are occupied. Stop the older project's services from its own project folder or inspect Docker Desktop before restarting this stack. |
| Old page or page cannot be reached | Confirm the branch, rebuild, check `docker compose ps`, and open `http://localhost:5173/` with a hard refresh. |
| API unavailable / batch loading fails | Run `docker compose logs --tail=100 api` and check the health/batches endpoints above. |
| Analysis stays queued | Check `docker compose ps` and `docker compose logs --tail=100 worker`; the worker and Redis must be running. |
| Analysis fails with key, model, or quota errors | Check the private `.env` key and configured model/account quota. Run `docker compose up -d --build` after changing `.env`. Avoid repeatedly queuing failed analyses before resolving the cause. |

Inspect recent service logs with `docker compose logs --tail=100 api worker`. Remove secrets and customer/sample data before sharing logs. Building and opening the UI does not itself test an actual Gemini analysis; verify a known sample separately.

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

Choose a batch in Samples to search and sort across the full batch, filter by AI confidence or processing status, select rows, and inspect/edit an individual record through Samples. Deleting selected records requires confirmation and is refused if any selected sample has an active or queued analysis job. Exports previously downloaded are unaffected. Saved media is removed when record deletion succeeds. Keep backups if audit retention is necessary.

## Researcher-focused workspace

The default route opens **Scan**, where batch creation and sample intake already live. **Samples** combines batch-wide search, sorting, confidence filters, multi-selection and verification; clicking any row opens a video/frame gallery with inline field corrections. **Export** places the real CSV download first and keeps the blank template and label mapping as optional reference material. A header **Help** button describes the three-step workflow. Historical links to `/review?batch=...&sample=...` redirect to the Samples inspector without changing stored data.

