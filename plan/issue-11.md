# Issue #11 Containerization Plan

## Goals
- Provide Docker images for backend Go server and frontend Vite app.
- Supply docker-compose orchestration for development with sensible env wiring.
- Update documentation for container workflow.

## Tasks
- [x] Backend container assets
  - [x] Create multi-stage `backend/Dockerfile` compiling `cmd/server` binary and exposing `PORT` (default 8080) with configurable signaling origins.
  - [x] Add `backend/.dockerignore` to trim build context (bin/, tmp/, .git, local artifacts).
  - [x] Document backend container usage in README.
- [x] Frontend container assets
  - [x] Create `frontend/Dockerfile` using Node 22, caching deps, running `npm run dev -- --host 0.0.0.0`, and wiring `VITE_SIGNALING_WS_URL` env.
  - [x] Add `frontend/.dockerignore` ignoring `node_modules`, `dist`, etc.
  - [x] Ensure env usage documented for overriding signaling URL.
- [x] Docker Compose setup
  - [x] Add root `docker-compose.yml` with backend/frontend services, builds, volumes, env vars, and port mappings.
  - [x] Update `README.md` and `docs/setup.md` to describe Compose workflow, rebuild instructions, env overrides.
  - [x] Verify existing manual setup docs remain coherent and reference new container workflow.

## Notes
- Confirm backend env var names align with existing server configuration.
- Keep development focus (live reload, volumes) while keeping instructions concise.
- After implementation, run lint/test if feasible; otherwise mention rationale.
