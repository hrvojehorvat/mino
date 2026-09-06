# Mino Testing & "Done" Criteria

Grows as test types/phases are added. Each phase should append its own "done" section here before being marked done in `roadmap.md`.

## Phase 1 — MVP: Finger Tapping

**Definition of done:**
1. A person can launch the mobile app on a simulator/device, start a finger-tapping session, complete it (session ends automatically after the fixed duration), and see a minimal completion confirmation in the UI.
2. Every touch-down/touch-up event during the session is captured client-side with timestamp, coordinates, and pointer id.
3. On session completion, the full event batch is submitted to the backend API, and a corresponding `TestSession` row plus one `RawEvent` row per captured event exist in Postgres — verifiable directly via SQL (`SELECT * FROM "RawEvent" WHERE "sessionId" = ...` returns exactly the expected event count, in correct sequence order).
4. Malformed/invalid submissions (missing fields, absurd event counts) are rejected by the API with a clear 4xx response, not silently accepted or crashing the server.
5. Type checks pass across the whole workspace (`tsc --noEmit` for mobile + backend), and at least the automated tests below exist and pass.

**Testing approach:**
- **Backend integration test (write this first, highest value):** spin up the NestJS app against a test Postgres (or Prisma's test-db pattern), POST a realistic tapping-session payload to the ingestion endpoint, assert the response and assert the DB rows via the Prisma client directly. This is the core "does the pipeline work" test — automated and repeatable in CI, not just manual.
- **Backend validation tests:** negative cases — missing `deviceId`, empty event list, event count wildly exceeding what's physically possible in the session duration — asserting proper rejection.
- **Mobile:** manual verification pass for MVP (run in simulator, perform a tapping session, confirm UI completes with no console errors). Full automated E2E (e.g. Detox) is out of scope for MVP per "simplicity first" — a candidate for a later phase once the app has more surface area worth protecting.
- **Manual end-to-end sanity check** as the final gate before calling Phase 1 done: real device or simulator run, followed by direct SQL inspection of the resulting rows, confirming event sequence/timestamps look sane (monotonic, plausible durations).

This keeps verification proportionate to MVP scope: a real integration test where it matters most (the ingestion pipeline), manual checks where automation would be premature investment (mobile E2E).

## Phase 2 — Remaining test types (data collection only)

**Definition of done:**
1. All five remaining test types (Reaction Time, Target Tapping, Finger Tracing, Phone Stability, Guided Movement) are launchable from the mobile home screen, each capturing its raw data and submitting successfully.
2. Discrete-event tests (Reaction Time, Target Tapping, Finger Tracing) persist as `RawEvent` rows with the correct `eventType` sequence; Finger Tracing additionally persists its `testParams.referencePath`.
3. Continuous-sensor tests (Phone Stability, Guided Movement) persist a `SensorSession` row containing the ordered `samples` array, with zero `RawEvent` rows.
4. Sensor-based tests gate their Start button on sensor availability up front (`useMotionSensors`'s `checking`/`available`/`unavailable` status) rather than letting the user hit a runtime failure — web is always treated as `unavailable` since expo-sensors' web shim is unreliable (see `lessons.md`).
5. Type checks pass across the whole workspace, and `apps/api`'s e2e suite has a happy-path case per new test type (10/10 passing as of Subphase 2.5).
6. Manual verification pass on both a physical device (Expo Go) and `expo export --platform web`, for every new screen.

**Testing approach:** same as Phase 1 — one backend e2e happy-path case per test type asserting the correct rows land (`RawEvent` sequence or `SensorSession.samples`), plus manual on-device/web checks per screen as it's built. No new automation category needed; Phase 2 extends the same pipeline Phase 1 established rather than introducing a new one.

## Phase 3 — ML pipeline v1

**Definition of done:**
1. `services/ml`'s poller finds every `Completed` session with no `MLResult` row yet under the current `modelId`/`modelVersion`, computes metrics, and saves exactly one result row per session — verified idempotent (re-running finds nothing new to do).
2. Each of the six test types has real (non-placeholder) metrics, computed only from that session's own raw data (`RawEvent` rows, `TestSession.testParams`, or `SensorSession.samples` depending on test type) — never compared against a fixed/clinical threshold, only against the session's own data (e.g. Reaction Time's lapse threshold, Guided Movement's response threshold).
3. Every feature module has unit tests against hand-computed synthetic fixtures (exact expected numbers, not just "did it run"), plus an integration test that inserts real rows into the `mino_test` Postgres database, runs the actual poller, and asserts on the saved `MLResult` row.
4. Metrics were spot-checked against real captured dev-DB sessions for every test type, not just synthetic fixtures — this is what caught both real bugs below.
5. Type checks pass across the whole workspace; `uv run pytest` passes for `services/ml`.

**Testing approach:** unit tests carry the actual correctness bar (exact hand-computed numbers), integration tests prove the pipeline wiring end-to-end (DB → poller → saved row), and a final manual pass against real dev-DB data is the gate before calling a step done — synthetic fixtures alone missed real data-quality issues twice this phase (see `lessons.md`).

**Update (post-Phase 3.5):** `services/ml` was later reworked into a stateless Flask HTTP service with no database access at all — the DB-orchestration logic ("find pending sessions, load raw data, save a result") and its integration test moved into `apps/api` (`MlService`), triggered on demand and by a background sweep instead of a standalone poller (see `decisions/0006-ml-trigger-mechanism.md`, Update 3). `services/ml`'s own test suite is now pure unit tests on `compute()` plus a Flask-endpoint smoke test; the DB-round-trip proof above now lives in `apps/api`'s e2e suite (`batches.e2e-spec.ts`).

## Phase 3.5 — Test batches

**Definition of done:**
1. `POST /batches` creates a batch (optionally named) for a device; `GET /batches?deviceId=...` lists that device's batches newest-first, each with its session count.
2. `POST /sessions` requires `batchId` and rejects one that doesn't exist or belongs to a different device (400).
3. A person can, on-device, pick 2+ tests in the mobile app, run them back-to-back without returning to a list in between, and see the resulting batch appear in the history list with the correct test count.
4. Type checks pass across the whole workspace; `apps/api`'s e2e suite covers batch creation, listing, and session/batch validation.

**Testing approach:** same pattern as Phase 1/2 — backend e2e tests against the real `mino_test` Postgres database for the new endpoints and the `batchId` validation path, plus a manual on-device run as the final gate (build a batch, run through it, confirm it shows up correctly in history).

## Phase 4 — LLM explanation layer

**Definition of done:**
1. `POST /batches/:id/explain` calls `services/llm-explain` with only `{testType, metrics}` pairs (never raw sessions), persists exactly one `LLMExplanation` row per `(batchId, modelId, modelVersion)`, and returns the same cached row on a repeat call instead of regenerating.
2. `services/llm-explain`'s guardrail (`guardrail.py`) is enforced on the model's own output before any text leaves the service: a violating generation is retried once with a stricter prompt; a second violation returns `{ok: false}` rather than ever forwarding the text. Currently "violating" means diagnostic-style language with no accompanying not-a-doctor disclaimer (see `decisions/0007-llm-hosting-and-guardrail.md` for why this replaced an outright ban).
3. `services/llm-explain/tests/test_guardrail.py` (pure, fast) covers both directions: clean text with no diagnostic language, and diagnostic language correctly paired with a disclaimer, both pass; diagnostic language with no disclaimer is flagged.
4. A person can, on-device, complete a batch where every session has an `MLResult`, tap "Explain these results," and see a real plain-language explanation appear; viewing the batch again shows the same cached explanation with no second model call.
5. Type checks pass across `apps/api`/mobile.

**Testing approach:** same split as Phase 3 — fast deterministic unit tests carry the guardrail's correctness bar (`test_guardrail.py`, no model call), a slower GPU-marked eval set (`test_app.py`) exercises the real model against adversarial/edge-case prompts, run manually rather than on every commit. Manual on-device verification (build a batch, tap Explain, read the result) is the final gate, the same role it played in every prior phase.

**Not yet done, called out explicitly rather than silently skipped:** `test_app.py`'s real-model eval set hasn't been run since the guardrail moved from "ban diagnostic language" to "require a disclaimer alongside it" — worth doing before trusting the new policy under inputs designed to break it, not just the manual spot-check done so far.

## Later phases
To be filled in as each phase is planned in detail.
