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

The Gemini adapter supports optional `GEMINI_VIDEO_FPS`; when set to `5` or `10`, it passes `VideoMetadata(fps=...)`. Empty/default configuration uses Gemini's default video sampling. The direct-video path remains primary; frame fallback is not silently substituted.

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
