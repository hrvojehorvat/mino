# Mino Roadmap

Status legend: not started / in progress / done. Update the status line for a phase as it progresses — don't rewrite this file wholesale each time (see `lessons.md` for the end-of-session review process referenced in CLAUDE.md).

## Phase 0 — Repo scaffolding & tooling
**Status:** done

- [x] Monorepo layout: npm workspaces (`apps/*`, `packages/*`) — see `decisions/0001-monorepo-structure.md`.
- [x] `apps/mobile` — Expo (blank-typescript template) — see `decisions/0002-expo-vs-bare-rn.md`. Dev server (Metro) verified booting cleanly; opening in a simulator/device is a manual step.
- [x] `apps/api` — NestJS skeleton. Verified booting and responding on `GET /`.
- [x] `packages/shared-types` — initial wire-contract types, builds and type-checks cleanly.
- [x] `apps/api/prisma/schema.prisma` — datasource + generator only, no models yet (models are Phase 1 scope).
- [x] `docker-compose.yml` for local Postgres — running, verified accepting connections.
- [x] Prisma connectivity verified against the running Postgres container (schema validated + a live query executed successfully).
- CI skeleton: skipped for now per decision with the user (no remote yet).
- Explicitly out of scope: Azure provisioning, Kafka, ML/LLM scaffolding.

## Phase 1 — MVP: Finger Tapping end-to-end
**Status:** not started

- Mobile: tapping test screen, local event capture (touch down/up + timestamp + coords), session buffering, batched submit to API on completion.
- Backend: ingestion endpoint, payload validation, Prisma writes to `TestSession` + `RawEvent`.
- DB: Prisma schema for `User` (minimal), `TestSession`, `RawEvent`; migrations.
- No ML, no LLM, no Kafka, no derived scores.
- Done when: see `testing.md` for exact criteria.

## Phase 2 — Expand to remaining test types (data collection only)
**Status:** not started

- Add reaction time, target tapping, finger tracing, phone stability, guided movement — capture and ingestion only, still no ML/LLM.
- Resolve continuous-sensor storage decision here (see `decisions/0003-raw-event-storage-model.md` open question) — accelerometer/gyroscope tests at 50-100Hz won't fit the row-per-discrete-event model used for tapping.
- Stress-test the batched-HTTP transport decision at higher data volumes (see `decisions/0004-batched-http-transport.md`).

## Phase 3 — ML pipeline v1
**Status:** not started

- Python service, batch/offline analysis of stored raw sessions.
- Start with simple, explainable statistical/signal-processing features (e.g. inter-tap interval mean/variance) before reaching for ML models proper.
- Establish `MLFeatureSet` / `MLResult` tables and a model-artifact versioning convention.
- Decide async trigger mechanism (see `decisions/0005-kafka-deferred.md`).

## Phase 4 — LLM explanation layer
**Status:** not started

- Separate service/module. Input contract is strictly `MLResult` structured data — never raw sessions, never free-form DB access.
- Guardrails: system prompt + output validation against diagnostic/medical claims; maintain an eval set of prohibited-language test cases.

## Phase 5 — Personal baseline & anomaly detection
**Status:** not started

- Longitudinal analysis across a user's session history, per-user baselines, drift/anomaly detection.
- Where "pretrained models" and fine-tuning experiments (per CLAUDE.md's AI section) actually start.
- Intentionally left loose — depends on what Phase 1-3 reveal about data quality and available signal.
