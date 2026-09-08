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

**Manual testing without spending Modal credits:** `services/llm-explain/mino_llm/dev_stub.py` is a stdlib-only local server implementing the same `/health`/`/explain` contract as the real service, but always returning one fixed canned explanation instead of calling a model. Run it with `python3 -m mino_llm.dev_stub` from `services/llm-explain/` (no `uv`/vLLM needed — it deliberately has zero dependencies beyond the standard library, so it runs even where the real service's vLLM dependency can't be installed at all, see Phase 5b's environment note below). It listens on `LLM_SERVICE_URL`'s default port, so exercising the rest of the batch/explain flow (button state, caching, mobile UI) on-device needs no `.env` change and never reaches Modal. Use the real deployment only when the actual generated text matters.

## Phase 5a — Personal-baseline comparison

**Definition of done:**
1. `services/ml`'s `POST /baseline` computes per-metric z-scores against a supplied history and flags `isAnomalous = |zScore| > 2.0`, requiring at least 3 prior data points per metric (fewer → that metric omitted, not an error) and guarding zero-SD history (`zScore = 0`, not anomalous).
2. `apps/api`'s `BaselineService` finds every session with an `MLResult` but no `BaselineResult` yet (same on-demand trigger point as `MlService`, no background sweep), loads that user's prior sessions of the same `testType`/ML model/version as history, calls `services/ml`, and persists exactly one `BaselineResult` row per `(mlResultId, modelId, modelVersion)`.
3. `GET /batches/:id` includes `baseline: { sampleSize, metrics }` per session — `metrics: {}` with a growing `sampleSize` before enough history exists, populated with `value`/`baselineMean`/`baselineSd`/`zScore`/`isAnomalous` per metric once it does.
4. `services/ml/tests/test_baseline.py` (hand-computed fixtures: expected z-score, non-anomaly, insufficient-history, zero-SD, missing-metric, non-numeric-value) and `apps/api/test/baseline.e2e-spec.ts` (real `mino_test` Postgres: anomaly flagged after enough history, empty result before) all pass.
5. Type checks pass across the whole workspace; `uv run pytest` passes for `services/ml`; `apps/api`'s full e2e suite passes together, not just `baseline.e2e-spec.ts` in isolation (adding `BaselineResult`'s FK to `MLResult` required adding `baselineResult.deleteMany()` ahead of `mLResult.deleteMany()` in every e2e spec's cleanup — `batches.e2e-spec.ts`, `batches-explain.e2e-spec.ts`, `sessions.e2e-spec.ts`).
6. Manual on-device/API verification: several batches of the same test type run for one dev user, sample size growing with empty metrics until the threshold, then a deliberate outlier run correctly flagged.

**Testing approach:** same split as Phase 3/4 — pure hand-computed unit tests carry `compute_baseline`'s correctness bar, an e2e test proves the DB/HTTP wiring against a real Postgres, and a manual pass against the running API is the final gate. One infrastructure issue surfaced (not a baseline logic bug) while getting the full e2e suite green: `apps/api/.env`'s real Modal `LLM_SERVICE_URL` was leaking into e2e tests underneath `.env.test`, because Vite/Vitest loads the base `.env` regardless of mode — `vitest.config.e2e.ts` now pins `LLM_SERVICE_URL` back to the local stub explicitly, the same way it already pinned `DISABLE_ML_SWEEP`.

## Phase 5b — Baseline-grounded LLM explanations

**Definition of done:**
1. `services/ml`'s `compute_baseline` emits `favorable: bool | null` per metric alongside `isAnomalous`, from an explicit `METRIC_DIRECTION` lookup — correct in both directions for a lower-is-better metric, both directions for a higher-is-better metric, and `null` (never a guess) for a metric with no listed direction.
2. `apps/api`'s `LlmService` sends each session's existing `BaselineResult` (or `null` if none yet) to `services/llm-explain` alongside raw metrics — verified via the outgoing HTTP request body, not just the response.
3. `services/llm-explain/mino_llm/prompt.py` no longer asks the model to compare against other users or a clinical/population norm; it instead gives explicit per-anomaly framing rules keyed off `isAnomalous`/`favorable`.
4. A real-model regression case (`test_app.py`, GPU-marked) proves a favorable anomaly (e.g. reaction time far faster than personal history) is never hedged with help-seeking language — the concrete case the user reported.
5. Type checks pass across the whole workspace; `uv run pytest` passes for `services/ml` and `services/llm-explain`'s fast suite; `apps/api`'s full e2e suite passes.

**Testing approach:** same split as Phase 4/5a — hand-computed unit tests carry `favorable`'s correctness bar (`services/ml/tests/test_baseline.py`), pure fast tests carry the prompt-building logic (`services/llm-explain/tests/test_prompt.py`, mirroring `test_guardrail.py`'s style — no model call), an e2e test proves the real payload reaches `services/llm-explain` correctly shaped (extended `batches-explain.e2e-spec.ts`, capturing the stub server's received request body rather than just its response), and the GPU-marked eval set is the final gate for the actual model's behavior — run manually, same as the rest of `test_app.py`.

One environment note: `services/llm-explain`'s `pyproject.toml` declares `vllm` as a hard dependency, which pulls in `nvidia-cudnn-frontend` — a package with no macOS x86_64 wheel. `uv run pytest` therefore cannot sync at all on that platform, even for the fast, model-free tests (`test_prompt.py`/`test_guardrail.py`, neither of which imports `vllm`). Verified those two files instead via `PYTHONPATH=. uv run --no-project --with pytest -- python -m pytest ...`, which only installs `pytest` and skips the project's own dependency resolution. This is a pre-existing constraint of developing this service on an Intel Mac, not something introduced here — worth a real fix (e.g. an optional dependency group splitting `vllm` out of the fast test path) if this keeps coming up.

## Phase 6 — Real authentication

**Definition of done:**
1. `POST /auth/signup` creates a `User` with a hashed password and returns a JWT; a duplicate email is rejected (409); a password under 8 characters is rejected (400).
2. `POST /auth/login` returns a JWT for correct credentials; wrong password and unregistered email are both rejected (401), without revealing which.
3. Every route that used to trust a raw `deviceId` (`/batches`, `/sessions`, `/batches/:id/explain`) is now behind `JwtAuthGuard`: no `Authorization` header, a malformed token, or another user's token all correctly fail (401 or 404-by-ownership, never silently returning someone else's data).
4. `apps/api/test/auth.e2e-spec.ts` covers all of the above; every pre-existing e2e spec (`sessions`, `batches`, `batches-explain`, `baseline`) was converted from a hardcoded `deviceId` to `signupAndAuthenticate()`/`bearer()` (`apps/api/test/support/auth.ts`) and still passes — full suite green (38/38 across 6 files).
5. Mobile: signed out on fresh launch (no stored token) shows `SignInScreen`; signing up or logging in reaches the existing test-picker flow; every API call from the mobile app sends the bearer token instead of a device ID; logging out returns to `SignInScreen`. Type checks pass for `apps/mobile`.
6. Manual verification: signed up via the running API, created a batch, logged in again with a fresh token, confirmed the batch was still attached to that account.

**Testing approach:** same split as every prior phase — an e2e spec against the real `mino_test` Postgres carries the auth-flow correctness bar (signup/login/guard edge cases), the existing e2e specs double as regression coverage that the identity-model swap didn't break any authorization check, and a manual pass against the running dev API (`curl`, not just the automated suite) is the final gate. One environment wrinkle surfaced while getting the full suite green: the local `mino_test` database still had pre-auth rows with no `email`/`passwordHash`, which blocked the new migration the same way the dev DB did — reset with explicit user confirmation each time (`prisma migrate reset --force`; Prisma's own AI-agent safety guard requires this confirmation to be threaded through as an env var, on top of the project's own practice of asking before destructive commands).

## Later phases
To be filled in as each phase is planned in detail.
