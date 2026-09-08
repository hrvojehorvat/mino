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
**Status:** done

- [x] Prisma schema for `User`, `TestSession`, `RawEvent` (camelCase fields, PascalCase enums) + migration — see `decisions/` and `data-model.md`.
- [x] Backend: `POST /sessions` ingestion endpoint, `class-validator` DTO validation + service-level physical-plausibility checks, atomic Prisma write. Manually verified via curl (201 happy path, 400 on missing field/empty events/absurd event count) and a backend integration test suite (5 passing tests against a real `mino_test` Postgres database).
- [x] Mobile: tapping test screen (`TappingScreen.tsx`) with fixed 10s session, touch capture via `performance.now()`-relative timestamps, device-id persistence, batched submission to the API. Type-checks and bundles cleanly (web bundle verified).
- [x] Manual on-device verification pass — superseded by the far more extensive real-device testing done throughout Phases 2-3 (see `lessons.md`: dropped-touch-event and sensor bugs were both caught on real hardware, not simulators), which would have been impossible if the base Phase 1 pipeline weren't already working end-to-end on-device.
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

- [x] `services/ml` Python service: computes metrics for one session's raw data and returns them — a stateless Flask endpoint, no database access. `apps/api` finds sessions with no `MLResult` row yet under the current model/version, calls `services/ml`, and saves the row itself — triggered on demand (viewing a batch) and by a 30s background sweep. No Kafka/queue in between, per `decisions/0005-kafka-deferred.md` and `decisions/0006-ml-trigger-mechanism.md` (Update 3).
- [x] `MLResult` table (Prisma migration) with a `(sessionId, modelId, modelVersion)` uniqueness convention — a math change bumps `modelVersion` rather than overwriting old rows, keeping every past result reproducible. See `data-model.md`.
- [x] Real statistical/signal-processing features for all six test types: tap timing/consistency/fatigue (Finger Tapping), reaction speed/consistency/lapses (Reaction Time), tap accuracy/speed (Target Tapping), path deviation/smoothness (Finger Tracing), shake amplitude/frequency (Phone Stability), prompt response latency/peak/direction (Guided Movement).
- [x] Unit tests (hand-computed synthetic fixtures) and integration tests (real `mino_test` Postgres) for every feature module; verified against real captured dev-DB sessions for every test type.
- Explicitly out of scope, deferred to later phases: no LLM explanation layer yet (Phase 4), no cross-session baseline/anomaly detection yet (Phase 5).

## Phase 3.5 — Test batches
**Status:** done

- [x] `TestBatch` table (id, userId, name — optional, createdAt); `TestSession` now requires a `batchId`. No status field — a batch is just however many sessions it has so far. Existing pre-batch dev sessions were preserved via a backfilled "Legacy sessions" batch per user, not deleted.
- [x] Backend: `POST /batches` (create, optional name), `GET /batches` (history list with session counts, newest first, scoped to the caller — originally by a `deviceId` query param, later by the authenticated user once Phase 6 replaced that identity model). `POST /sessions` requires and validates `batchId` against the submitting user's own batches.
- [x] Mobile: `BatchPickerScreen` (tap tests to add them to an ordered set, optional name, "Start"), sequential runner in `App.tsx` (chains the picked tests automatically — each test's "Run again" became "Next test"/"Finish", no return to a list in between), `BatchHistoryScreen` (past batches by name/date/test count).
- [x] `BatchDetailScreen` + `GET /batches/:id` (added just after this phase, once history needed somewhere to link to) — per-session status and `mlResult`, polling until every session has a result. This is what first made ML results user-facing, which is what exposed Phase 3's poller latency/DB-ownership problems and led to `decisions/0006`'s Update 3.
- Why this came before Phase 4: the user's batching idea (one AI call per batch instead of per test, since the AI call — not Phase 3's free 30s poll — is the only metered step) changes the data model and navigation Phase 4 depends on either way; doing it first avoids building Phase 4 around single sessions and reworking it.
- Verified via `apps/api`'s e2e suite (batch create/list/session-validation) and a manual on-device run building and completing a real multi-test batch.

## Phase 4 — LLM explanation layer
**Status:** done

- [x] `services/llm-explain` (Flask + vLLM): one call per `TestBatch`, input contract strictly `{testType, metrics}` pairs from `MLResult` — never raw sessions, never free-form DB access. Hosted on Modal (GPU required to run an 8B-class instruct model at all) — see `decisions/0007-llm-hosting-and-guardrail.md`.
- [x] `LLMExplanation` table (`apps/api`, Prisma) keyed on `(batchId, modelId, modelVersion)`, same reproducibility idiom as `MLResult`. `apps/api`'s `LlmService`/`LlmClientService` own all writes; `services/llm-explain` has no database access.
- [x] Mobile: "Explain these results" button on `BatchDetailScreen`, shown once every session in a batch has an `MLResult`.
- [x] Guardrail (`services/llm-explain/mino_llm/guardrail.py`): deterministic check on the model's own output, enforced before any text leaves the service — not just a prompt instruction. Originally a blanket ban on diagnostic-style language; revised (with a corresponding CLAUDE.md change) to instead require a not-a-doctor disclaimer whenever diagnostic-style language appears, rather than banning it outright.
- Not yet done: the GPU-marked real-model eval set (`services/llm-explain/tests/test_app.py`) hasn't been run against the current disclaimer-based guardrail — worth doing before trusting it under adversarial/edge-case inputs, not just the manual on-device spot-check done so far.

## Phase 5 — Personal baseline & anomaly detection
**Status:** in progress

- Longitudinal analysis across a user's session history, per-user baselines, drift/anomaly detection.
- Where "pretrained models" and fine-tuning experiments (per CLAUDE.md's AI section) actually start.
- Intentionally left loose — depends on what Phase 1-3 reveal about data quality and available signal.
- **Scope decision:** starts with personal-baseline comparison only (a session's metrics vs. that user's own history) — needs no external data and carries a much lighter liability posture than claiming population-normative comparison. **Deferred, marked for revisiting:** also comparing against a population norm/clinical threshold — needs either a real normative dataset from Mino's own users (not enough data yet) or sourced/validated clinical reference values, and is a meaningfully bigger regulatory step than within-user comparison. Revisit once there's real usage data or a deliberate decision to source external reference values.

### Phase 5a — Personal-baseline comparison
**Status:** done

- [x] `services/ml`: `POST /baseline` — pure `compute_baseline(history, current, z_threshold=2.0)`, per-metric z-score vs. the user's own history, `isAnomalous = |zScore| > 2.0`. Requires at least 3 prior data points per metric; below that, that metric is simply omitted (not an error). Guards zero-SD history. Deliberately generic over metric names, like `/compute`.
- [x] `BaselineResult` table (`apps/api`, Prisma), keyed on `(mlResultId, modelId, modelVersion)` — note this FKs to `MLResult`, not `TestSession` (a deliberate deviation from the original plan sketch), so a future `MLResult` model-version bump can't leave a stale `BaselineResult` looking "already computed." See `data-model.md`.
- [x] `BaselineService`/`BaselineClientService` (`apps/api/src/baseline/`), mirroring `MlService`'s shape exactly: on-demand only, no background sweep — wired into `BatchesService.findOneForUser`'s existing pending-computation chain, right after `MlService`'s own step.
- [x] `packages/shared-types` + `GET /batches/:id` response: `baseline: BaselineResultSummary | null` per session.
- [x] Unit tests (`services/ml/tests/test_baseline.py`, hand-computed fixtures) and e2e tests (`apps/api/test/baseline.e2e-spec.ts`, real `mino_test` Postgres) — sample-size growth, anomaly flagging, insufficient-history empty result.
- [x] Manual verification: 4 real batches submitted through the running API for one dev device, `sampleSize` observed growing 0→1→2→3 with `metrics: {}` until the threshold, then the deliberately fast 4th run correctly flagged `tapRateHz`/inter-tap-interval as anomalous with sensible z-scores while unrelated metrics (`tapDurationMeanMs`) stayed non-anomalous.
- Explicitly not in this slice: no mobile UI, no LLM/guardrail change, no population-norm comparison (see Phase 5's scope note above) — the API response carries the data so it's inspectable, ready for a later slice to decide how (or whether) to surface it.

### Phase 5b — Baseline-grounded LLM explanations
**Status:** done

- [x] `services/ml`: `compute_baseline` now also emits `favorable: bool | null` per anomalous metric, from a small explicit `METRIC_DIRECTION` lookup (lower/higher-is-better per metric name) — an anomaly's good/bad framing is a deterministic fact computed here, never left for the LLM prompt to guess. `BaselineResult`'s `modelVersion` bumped `1 → 2` for the output-shape change.
- [x] `apps/api`: `LlmService` now reads each session's existing `BaselineResult` (read-only, same "require, don't compute inline" convention already used for `MLResult`) and sends it to `services/llm-explain` alongside the raw metrics. `LlmService`'s `MODEL_VERSION` bumped `2 → 3` for the prompt change.
- [x] `services/llm-explain/mino_llm/prompt.py`: removed the old "compare to other users of this app and compare to a clinical threshold or population norm" instruction — unsupported by any data this service ever received, and the direct cause of generic/hallucinated comparison language. Replaced with explicit rules keyed off the real per-metric `isAnomalous`/`favorable` signal: non-anomalous → plain/positive, never help-seeking language; anomalous+favorable → good news, no hedging; anomalous+unfavorable → the only case where cautious/disclaimer-paired language is appropriate; anomalous+unknown-direction → neutral, no good/bad claim.
- [x] Tests: `services/ml/tests/test_baseline.py` (favorable in both directions, unknown-direction stays null), new `services/llm-explain/tests/test_prompt.py`, extended `apps/api/test/batches-explain.e2e-spec.ts` (asserts the outgoing request's `baseline` shape), a GPU-marked regression case in `services/llm-explain/tests/test_app.py` for the exact user-reported complaint (a favorable anomaly must never be hedged).
- Motivated directly by user feedback: explanations were generic/similar because the prompt asked for a comparison (population norm) that never had real data behind it, and good/better-than-average results were sometimes hedged toward help-seeking language when they shouldn't be. Corrected mid-design after user feedback that `isAnomalous` alone conflates "very different" with "bad" — a favorable anomaly must be framed as unambiguously great, not merely spared from caution.
- Not in this slice: population-norm/clinical-threshold comparison (still deferred), mobile UI (doesn't surface `favorable`/baseline directly — only feeds the explanation text).

## Phase 6 — Real authentication
**Status:** done

- [x] Replaced the MVP device-ID identity model with real accounts: `User` gains `email` (unique), `passwordHash`, `name`; `deviceId` removed. New `AuthModule` (`apps/api/src/auth/`) — `POST /auth/signup`, `POST /auth/login`, both returning a JWT (`@nestjs/jwt`, 30-day expiry) plus the user's `{id, name, email}`. Passwords hashed with `bcryptjs` (pure JS — avoids a native build step, since this all gets containerized for the upcoming Azure deployment).
- [x] `JwtAuthGuard` + `@CurrentUser()` decorator applied to `SessionsController`/`BatchesController`; every service method that used to take/upsert on a raw `deviceId` now takes the already-authenticated `userId` directly (`findAllForUser`, `findOneForUser`, `explainForUser`, etc. — see `data-model.md`).
- [x] Mobile: new `SignInScreen` (toggles signup/login), `src/auth.ts` (replaces `deviceId.ts` — stores the JWT in `AsyncStorage`, adds `authHeader()`/`logout()`). `App.tsx` gates every other screen behind a stored token; `BatchHistoryScreen` gained a "Log out" action.
- [x] `packages/shared-types`: added `SignupRequest`/`LoginRequest`/`AuthResponse`; removed `deviceId` from `TestSessionSubmission`/`TestBatchSubmission`.
- [x] New `apps/api/test/auth.e2e-spec.ts` (signup/login happy paths, duplicate email, wrong password, missing/invalid/valid bearer token). Every existing e2e spec (`sessions`, `batches`, `batches-explain`, `baseline`) converted from a hardcoded `deviceId` to a `signupAndAuthenticate()`/`bearer()` test helper (`apps/api/test/support/auth.ts`).
- [x] Manual verification: signed up via the running API, created a batch, logged in again with a fresh token, confirmed the batch was still there under that account.
- Local dev and test Postgres databases were reset (`prisma migrate reset --force`, explicit user consent each time — Prisma's own AI-agent safety guard requires it) rather than migrating old deviceId-only rows, since none of that data was worth preserving.
- Not in this slice (deliberately deferred — not needed for a personal wellness MVP): password reset, email verification, OAuth/social login, refresh tokens.

## Phase 7 — Azure deployment
**Status:** in progress

- [x] Resource group `mino-rg` created (`westeurope`).
- [x] Postgres server on Azure (`mino-db-hrvoje`, `northeurope`) + all 12 existing migrations run against it — see `azure-deployment.md` for the exact command log, including two false starts along the way: `westeurope` was rejecting new PostgreSQL Flexible Server customers, and a one-time `Microsoft.DBforPostgreSQL` provider registration was needed first.
- [x] Dockerfiles for `apps/api`, `services/ml`, `services/llm-explain`'s `dev_stub.py` — all three built and smoke-tested locally. Along the way: added `gunicorn` to `services/ml` (Flask's dev server isn't production-safe), and an explicit `openssl` install in `apps/api`'s image (Prisma's engine can't detect libssl on `node:20-slim` otherwise).
- [ ] Images pushed to GHCR.
- [ ] Azure Container Apps environment running all three (only `apps/api` public).
- [ ] `apps/mobile` static web export on Azure Static Web Apps, pointed at the live API.
- [ ] End-to-end test against the deployed stack.
- Full step-by-step command log kept in `azure-deployment.md`, not here — this entry just tracks phase status like every other roadmap phase.
- Workflow note: for this phase, the user runs every `az`/`gh` provisioning command themselves rather than Claude executing it via Bash — see `azure-deployment.md`'s header note.
