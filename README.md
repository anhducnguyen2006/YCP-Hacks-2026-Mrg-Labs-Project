# MRG Sample Scanner

MRG Sample Scanner is a local-first laboratory application for digitizing cylindrical grease/oil sample labels. Technicians will record a short rotation video, flatten the label with [spin-scan](https://github.com/adamplabarge/spin-scan), extract structured fields, review uncertain values, and export selected samples.

This repository contains the foundation phase. The application shell, service health endpoint, database/queue configuration, Docker development stack, and smoke tests are ready. Scanning, OCR, review automation, and CSV export are intentionally not implemented yet.

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

See [docs/architecture.md](docs/architecture.md) for boundaries, data flow, and decisions.
