# MRG Sample Scanner — Agent Instructions

## Product scope

MRG Sample Scanner digitizes laboratory grease/oil sample labels. The active workflow is:

`Create Batch -> Upload short video -> Queue RQ job -> Send original video to Gemini -> Validate structured JSON -> Persist editable sample`

Gemini directly interprets the rotating video. Do not introduce spin-scan, cylindrical panorama reconstruction, or a custom neural network. There is intentionally no History tab, cloud deployment, user authentication, advanced anomaly dashboard, custom schema editor, or final CSV export yet.

## Required stack

- Frontend: React + TypeScript + Vite, Mantine, React Router, TanStack Table, TanStack Query.
- Backend: Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, PostgreSQL, Redis, RQ, and the official `google-genai` SDK.
- Video inspection: FFmpeg/ffprobe. Original videos and representative keyframes are stored in the shared Docker media volume.
- Tests: Vitest + React Testing Library and pytest.

## Exact data contract

The future default CSV export has exactly these columns, in this order:

1. `Sample ID`
2. `Date Sampled`
3. `Date Received`
4. `Machine`
5. `Component`
6. `Serial Number`
7. `Refrence Lube`

`Refrence Lube` is intentionally misspelled to match the supplied template. Internal names may use `reference_lube`. Blank or inapplicable values must be empty strings, never `N/A`. IDs, machine identifiers, and serial numbers are strings, never integers.

Large labels: Sample ID = barcode/printed number; Date Sampled = Date; Date Received = batch receiving date; Machine = Equip ID; Component = Sample point; Serial Number = blank; Refrence Lube = Ref Lube.

Small labels: Sample ID = barcode/printed number; Date Sampled = Date; Date Received = batch receiving date; Machine = RN; Component = physically circled number plus physically circled GS/NGS; Serial Number = SN; Refrence Lube = blank.

## Engineering conventions

- Keep frontend features in `frontend/src/features` and shared UI in `frontend/src/components` as the application grows.
- Keep backend application code in `backend/app`; use typed Pydantic schemas at API boundaries.
- Use environment variables for service configuration; never commit secrets. `GEMINI_API_KEY` belongs only in backend API/worker environments, never `VITE_*`.
- Preserve human-reviewed `current_value` fields when retrying automatic extraction.
- Do not fabricate confidence values. Gemini-subjective confidence is nullable and separate from validated review state.
- Keep video uploads server-validated by MIME/content inspection and ffprobe duration; never trust a filename extension alone.
