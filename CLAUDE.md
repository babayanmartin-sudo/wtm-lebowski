# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Detailed instructions live in `.claude/rules/`, loaded automatically based on which files you're touching:
- `backend-architecture.md` — data model, router/service layout, migrations, patterns to preserve (backend/**)
- `frontend-architecture.md` — React/TS structure, file layout, key patterns (frontend/**)
- `conventions.md` — naming, amount handling, API design, pattern matching, locale parsing (backend + frontend)
- `key-patterns.md` — annotated code snippets for transaction build, dashboard breakdown, matcher, loan balance (backend/**/*.py)
- `testing.md` — pytest fixtures and conventions (backend/tests/**)
- `common-tasks.md` — step-by-step recipes (add transaction field, add breakdown, add validation, add import preset)
- `debugging.md` — known gotchas by symptom

## Quick Start

**Dev mode**: `./run.sh` starts both backend (FastAPI on :8000) and frontend (Vite on :5173 w/ `/api` proxy).
**Tests**: `cd backend && .venv/bin/python -m pytest tests`
**Build**: `npm run build` in `frontend/`; Docker: `docker compose up -d`
**Env**: set `ET_BASE_CURRENCY`, `ET_DATA_DIR`, `ET_STATIC_DIR`, `ET_COOKIE_SECURE` in `.env` or `docker-compose.yml`

## Tools & Commands

```bash
# Backend
cd backend
.venv/bin/uvicorn app.main:app --reload --port 8000  # dev with hot reload
.venv/bin/python -m pytest tests -xvs  # run tests, stop on first failure
.venv/bin/python -m pytest tests -k "test_name"  # run one test
.venv/bin/python -m pytest tests --tb=short  # short traceback

# Frontend
cd frontend
npm run dev  # Vite dev server :5173
npm run build  # build for production
npm run preview  # test production build

# Docker
docker compose up -d  # prod build, runs both backend + frontend on :8000
docker compose down
docker compose logs -f app
```

## Versioning & Releases

Tags use semver: `v1.0.0`, `v1.0.1`, etc.
- **Minor fixes**: append patch version (1.0.2)
- **Features**: increment minor (1.1.0)
- Create tag: `git tag v1.0.2 && git push origin v1.0.2`
- GitHub Actions may auto-release (check Actions tab if configured)
