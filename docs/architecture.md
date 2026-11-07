# Architecture

## Context

MRG Sample Scanner is a local-first browser application for laboratory technicians. Technicians create a persistent batch, upload a short rotation video, and request Gemini to interpret the original video across frames. The backend validates and stores the structured extraction, while the technician can correct fields immediately.

## Current vertical slice

- `frontend/` is a Vite React application. Mantine provides the visual system, React Router owns navigation, and TanStack Query owns API state and polling.
- `backend/` is a FastAPI application. Pydantic schemas define API and extraction boundaries, SQLAlchemy 2 owns persistence, and Alembic owns migrations.
- PostgreSQL stores batches, samples, fields, media metadata, and processing jobs.
- Redis is the queue broker. RQ workers execute Gemini extraction and keyframe generation outside API request lifetimes.
- A named Docker volume is shared between API and worker for original videos and extracted frames.
- Docker Compose provides PostgreSQL, Redis, API, worker, and the static frontend.

## Workflow

1. `POST /api/batches` creates a batch with a receiving date.
2. `POST /api/batches/{id}/samples` validates the extension/MIME, writes a generated safe filename, checks size, and uses `ffprobe` to validate duration.
3. The sample and queued processing job are persisted.
4. `POST /api/samples/{id}/analyze` enqueues the RQ job.
5. The worker sends the original video to Gemini Files API, waits for processing, requests structured JSON, deletes the temporary remote upload, extracts a representative frame with FFmpeg, and persists fields.
6. The frontend polls while processing, displays the original video/keyframe and all seven fields, and saves manual field corrections through `PATCH`.

The Gemini adapter supports the official `google-genai` Files API and `generateContent` direct-video path, plus a frame path. The frame path uses FFmpeg/ffprobe to honor container orientation, sample up to 12 chronological JPEGs at configurable timestamps, preserve up to 2048px width, and submit all images in one request. Temporary inference frames are cleaned up; a representative frame and sampled frames are retained in shared media storage for review. `GEMINI_VIDEO_FPS` is optional and is passed as `VideoMetadata(fps=...)` only for direct video.

`GEMINI_INPUT_MODE` supports `video`, `frames`, and `auto`. The default is `frames` after controlled tests showed the configured provider returned 503 for direct video, one image, and ten-image requests. `auto` allocates one combined retry budget: it tries direct video first and uses only remaining attempts for frames after transient video failures. The Interactions API was tested once and returned HTTP 400 because this installed SDK's legacy Interactions schema is no longer supported; it is not used by the application.

Provider recovery has one total inference budget (`GEMINI_MAX_ATTEMPTS`, default three) with exponential backoff and jitter capped by `GEMINI_MAX_RETRY_WAIT_SECONDS`. The SDK's internal HTTP retry count is explicitly set to one, so only the application owns retries. Only transient 429/500/502/503/504 responses are retried; permanent 400/401/403/404 failures are surfaced immediately. An explicitly configured `GEMINI_FALLBACK_MODEL` receives only the remaining budget after the primary model and is checked for `generateContent` support first. RQ does not retry the job, preventing multiplied Gemini calls. The successful model is recorded on `ProcessingJob.model_used`.

Use `backend/scripts/test_gemini.py` for explicit, isolated `models`, `text`, and `video` diagnostics. These commands do not run automatically and do not depend on PostgreSQL, Redis, or FastAPI.

## Decisions and safeguards

1. **API-first boundary:** the frontend communicates through `/api`; it does not connect directly to PostgreSQL, Redis, or Gemini.
2. **Configuration by environment:** service URLs, media limits, model, and CORS origins are environment-driven. Secrets are ignored by Git.
3. **Persistent unfinished batches:** batch/sample/job state is in PostgreSQL, not browser storage.
4. **Asynchronous processing:** Gemini and FFmpeg work run in RQ jobs. Failed jobs expose an error and can be retried from the Scan page.
5. **Explicit export contract:** the seven headers, order, intentional spelling, empty-string behavior, and string identifiers remain recorded in `AGENTS.md`; CSV export is a later phase.
6. **No fake functionality:** a missing `GEMINI_API_KEY` fails the processing job explicitly. Automated tests mock extraction; no fabricated production result is returned.
7. **No authentication in this version:** the local application assumes a trusted workstation.

## Planned domain flow

`Batch` -> uploaded `SampleMedia(video)` -> queued `ProcessingJob` -> extracted `SampleField` values -> manual review/correction -> future selected export.

Large and small label templates remain configuration concerns. Gemini must detect physically circled small-label options and must not guess unreadable identifiers or dates.
