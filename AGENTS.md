# MRG Sample Scanner — Agent Instructions

## Product scope

MRG Sample Scanner digitizes laboratory grease/oil sample labels. The current local integration supports video uploads, selected-frame Gemini extraction, RQ background processing, human field verification, and actual CSV export. Do not describe these as production-validated or claim calibrated AI confidence scores. Large-batch throughput and accuracy remain to be measured. There is intentionally no History tab, cloud deployment, user authentication, or custom neural-network training.

## Required stack

- Frontend: React + TypeScript + Vite, Mantine, React Router, TanStack Table, TanStack Query, and frame-gallery review.
- Backend: Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, PostgreSQL, Redis, and RQ.
- Tests: Vitest + React Testing Library and pytest.

## Exact data contract

The default CSV export has exactly these columns, in this order:

1. `Sample ID`
2. `Date Sampled`
3. `Date Received`
4. `Machine`
5. `Component`
6. `Serial Number`
7. `Refrence Lube`

`Refrence Lube` is intentionally misspelled to match the supplied template. Internal Python/TypeScript names may use `reference_lube`.

Large labels map `Sample ID` to barcode or printed barcode number, `Date Sampled` to Date, `Date Received` to the configurable batch receiving date, `Machine` to Equip ID, `Component` to Sample point, `Serial Number` to blank, and `Refrence Lube` to Ref Lube.

Small labels map `Sample ID` to barcode or printed barcode number, `Date Sampled` to Date, `Date Received` to the configurable batch receiving date, `Machine` to RN, `Component` to the circled number plus circled GS/NGS, `Serial Number` to SN, and `Refrence Lube` to blank.

Blank or inapplicable values must export as empty strings, never `N/A`. IDs, machine identifiers, and serial numbers are strings, never integers.

## Engineering conventions

- Keep frontend features in `frontend/src/features` and shared UI in `frontend/src/components`.
- Keep backend application code in `backend/app`; use typed Pydantic schemas at API boundaries.
- Use environment variables for service configuration; never commit secrets.
- Preserve the exact data contract above when adding models, templates, extraction, or export code.
- Prefer focused tests beside the relevant feature or in the existing test directories.
