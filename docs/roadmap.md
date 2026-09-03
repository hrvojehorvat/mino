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
**Status:** in progress — implementation complete, pending manual on-device verification

- [x] Prisma schema for `User`, `TestSession`, `RawEvent` (camelCase fields, PascalCase enums) + migration — see `decisions/` and `data-model.md`.
- [x] Backend: `POST /sessions` ingestion endpoint, `class-validator` DTO validation + service-level physical-plausibility checks, atomic Prisma write. Manually verified via curl (201 happy path, 400 on missing field/empty events/absurd event count) and a backend integration test suite (5 passing tests against a real `mino_test` Postgres database).
- [x] Mobile: tapping test screen (`TappingScreen.tsx`) with fixed 10s session, touch capture via `performance.now()`-relative timestamps, device-id persistence, batched submission to the API. Type-checks and bundles cleanly (web bundle verified).
- [ ] Manual on-device verification pass (run mobile + API together, perform a real tapping session, confirm completion UI, spot-check DB rows) — see `testing.md`'s Phase 1 checklist; this step needs a person, not automatable.
- No ML, no LLM, no Kafka, no derived scores.
- Done when: see `testing.md` for exact criteria.

## Phase 2 — Expand to remaining test types (data collection only)
**Status:** done

- [x] Reaction Time, Target Tapping, Finger Tracing — extend `RawEvent`/`TouchEventType`, no schema restructure.
- [x] Continuous-sensor storage decision resolved (see `decisions/0003-raw-event-storage-model.md`) — new `SensorSession` JSONB model, isolated behind `SensorSessionsService.storeSamples()`.
- [x] Phone Stability, Guided Movement — `useMotionSensors` shared hook (accelerometer+gyroscope capture, sensor-availability gating, web always treated as unavailable). Guided Movement adds on-screen timed prompts (UI-only, not persisted).
- [x] Batched-HTTP transport decision reviewed against real sensor payload sizes (see `decisions/0004-batched-http-transport.md`) — found and fixed Express's default 100kb body limit, which real payloads exceeded.
- Still no ML/LLM — capture and ingestion only, per Phase 2 scope.
- **Future improvement, not yet scheduled:** Finger Tracing currently shows one fixed reference path per session. Extend it to multiple trials per session (minimum 3, e.g. 5 to match Reaction Time) drawn from a pool of ~10 varied curve shapes, picked randomly per run — avoids users memorizing a single fixed line. Same pattern as Reaction Time's multi-trial change: no schema change needed, widen `testParams.referencePaths` to an array and infer trial boundaries from `touchDown`/`touchUp` pairing in the event stream.

## Phase 3 — ML pipeline v1
**Status:** done

- [x] `services/ml` Python service: polls Postgres every 30s for sessions with no `MLResult` row yet under the current model/version, computes metrics, saves a row — no Kafka/queue, per `decisions/0005-kafka-deferred.md`.
- [x] `MLResult` table (Prisma migration) with a `(sessionId, modelId, modelVersion)` uniqueness convention — a math change bumps `modelVersion` rather than overwriting old rows, keeping every past result reproducible. See `data-model.md`.
- [x] Real statistical/signal-processing features for all six test types: tap timing/consistency/fatigue (Finger Tapping), reaction speed/consistency/lapses (Reaction Time), tap accuracy/speed (Target Tapping), path deviation/smoothness (Finger Tracing), shake amplitude/frequency (Phone Stability), prompt response latency/peak/direction (Guided Movement).
- [x] Unit tests (hand-computed synthetic fixtures) and integration tests (real `mino_test` Postgres) for every feature module; verified against real captured dev-DB sessions for every test type.
- Explicitly out of scope, deferred to later phases: no LLM explanation layer yet (Phase 4), no cross-session baseline/anomaly detection yet (Phase 5).

## Phase 4 — LLM explanation layer
**Status:** not started

- Separate service/module. Input contract is strictly `MLResult` structured data — never raw sessions, never free-form DB access.
- Guardrails: system prompt + output validation against diagnostic/medical claims; maintain an eval set of prohibited-language test cases.

## Phase 5 — Personal baseline & anomaly detection
**Status:** not started

- Longitudinal analysis across a user's session history, per-user baselines, drift/anomaly detection.
- Where "pretrained models" and fine-tuning experiments (per CLAUDE.md's AI section) actually start.
- Intentionally left loose — depends on what Phase 1-3 reveal about data quality and available signal.
