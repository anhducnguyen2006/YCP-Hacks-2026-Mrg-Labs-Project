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
7. `Reference Lube`

`Reference Lube` is the required display and CSV column spelling. Internal Python/TypeScript field key stays `reference_lube`, so existing persisted data is preserved.

Large labels map `Sample ID` to barcode or printed barcode number, `Date Sampled` to Date, `Date Received` to the configurable batch receiving date, `Machine` to Equip ID, `Component` to Sample point, `Serial Number` to blank, and `Reference Lube` to Ref Lube.

Small labels map `Sample ID` to barcode or printed barcode number, `Date Sampled` to Date, `Date Received` to the configurable batch receiving date, `Machine` to RN, `Component` to the circled number plus circled GS/NGS, `Serial Number` to SN, and `Reference Lube` to blank.

Blank or inapplicable values must export as empty strings, never `N/A`. IDs, machine identifiers, and serial numbers are strings, never integers.

## Engineering conventions

- Keep frontend features in `frontend/src/features` and shared UI in `frontend/src/components`.
- Keep backend application code in `backend/app`; use typed Pydantic schemas at API boundaries.
- Use environment variables for service configuration; never commit secrets.
- Preserve the exact data contract above when adding models, templates, extraction, or export code.
- Prefer focused tests beside the relevant feature or in the existing test directories.

## Confidence contract

Overall sample-level `ai_confidence` is a nullable, model-reported high/medium/low **subjective rating** with a short `ai_confidence_reason`. Never present it as calibrated probability. Existing records remain null until a separately authorized reanalysis. Human review remains required. Field-level numeric confidence must not be fabricated or derived from this sample-level value.

## Current interface

Navigation is intentionally researcher-focused: Scan, Samples, Export and Settings. The header Help button explains the workflow. The old Review route remains as a backwards-compatible redirect into Samples; do not add a duplicate Review or Batches navigation entry unless specifically requested. Sample review/edit is inline inside the Samples detail modal. Export prominently offers a real batch CSV download, with format and label mapping as secondary reference content.

## Date extraction contract

The Gemini response includes `date_sampled_raw` (literal visual evidence) and `date_sampled` (ISO candidate only if fully legible). The backend independently normalizes clear US month/day/year and four-digit ISO dates; shortened years are provisional, incomplete dates remain blank, and contradictory or implausible dates are flagged. Preserve the literal evidence in the Date Sampled field's review reason, cap overall AI confidence when evidence conflicts, and never silently rewrite existing manually verified samples. Do not infer dates from Sample ID, RN, the current clock, or a batch-wide pattern. Retain the `date_sampled` database field and `reference_lube` internal key for backwards compatibility.
