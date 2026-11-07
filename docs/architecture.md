# Architecture

## Context

MRG Sample Scanner is a local-first browser application for laboratory technicians. A future scan flow will capture a rotating cylindrical sample tube, reconstruct its label, extract fields, and route low-confidence results to review before export.

## Current foundation

- `frontend/` is a Vite React application. Mantine provides the visual system, React Router owns navigation, and TanStack Query is the API state boundary. TanStack Table is installed for the forthcoming sample grid.
- `backend/` is a FastAPI application. Configuration is loaded with Pydantic Settings, SQLAlchemy 2 owns database connectivity, and Alembic owns schema migrations.
- PostgreSQL is the source of truth for batches, samples, templates, and export profiles when those domain models are added.
- Redis is the queue broker. RQ workers will run reconstruction and extraction jobs outside API request lifetimes.
- Docker Compose provides reproducible local infrastructure: PostgreSQL, Redis, API, worker, and the static frontend.

## Boundaries and decisions

1. **API-first boundary:** the frontend communicates through `/api`; it does not connect directly to PostgreSQL or Redis.
2. **Configuration by environment:** service URLs and local CORS origins are environment-driven. Secrets are only represented in `.env`, which is ignored.
3. **Persistent unfinished batches:** batch state will be persisted in PostgreSQL rather than browser storage, so a browser restart does not lose work.
4. **Asynchronous processing:** video reconstruction and extraction are job work, not synchronous HTTP work. RQ is selected for its small operational footprint and clear retry model.
5. **Explicit export contract:** the seven default CSV headers, their order, intentional `Refrence Lube` spelling, empty-string behavior, and string identifiers are part of the product contract and are recorded in `AGENTS.md`.
6. **No authentication in this version:** the local application assumes a trusted workstation. Authentication can be introduced at the API boundary later without coupling UI components to it.
7. **No fake functionality:** this phase exposes navigation and states for future workflows but does not claim that scanning, OCR, review automation, or CSV export work.

## Planned domain flow

`Batch` -> uploaded/captured `ScanAsset` -> queued `ProcessingJob` -> extracted `Sample` -> manual `Review` -> selected `Export`.

Large and small label templates will be versioned configuration, not hard-coded UI branches. The default field mapping remains governed by the contract in `AGENTS.md`.
