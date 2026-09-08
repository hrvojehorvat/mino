# Mino Data Model

Guiding rule (from CLAUDE.md): preserve raw data whenever practical, and keep it strictly separate from derived/ML features. This doc sketches the shape of the model — it should be kept in sync with the real Prisma schema as it evolves, since it changes at a different cadence (every schema change) than `architecture.md` (changes rarely).

## Core entities

### User
Real accounts: `id`, `email` (unique), `passwordHash`, `name`, `createdAt`. Identity is proven with a JWT (`Authorization: Bearer <token>`) issued by `POST /auth/signup` or `POST /auth/login`, not a client-generated device ID — that MVP shortcut (a UUID persisted on-device, upserted into `User` on first submission) was replaced once the app moved toward a real multi-user deployment. Passwords are hashed with `bcryptjs` (pure JS — no native build step, since this code is containerized for Azure).

### TestSession
One row per completed (or attempted) test run.

| field | notes |
|---|---|
| `id` | |
| `userId` | FK → User |
| `batchId` | FK → TestBatch — every session belongs to exactly one batch, see below |
| `testType` | enum; `FingerTapping`, `ReactionTime`, `TargetTapping`, `FingerTracing`, `PhoneStability`, `GuidedMovement` |
| `startedAt` / `endedAt` | |
| `clientAppVersion` | |
| `deviceMetadata` | JSON: OS, model — useful for later data-quality analysis |
| `status` | `Completed` / `Aborted` |
| `testParams` | nullable JSON — static per-session config that isn't itself a time-series, e.g. Finger Tracing's reference path (`{ referencePath: {x,y}[] }`). Distinct from `RawEvent`'s timestamped stream: this is set once at session start, not sampled over time. Null for test types that don't need it. |

Natural foreign-key anchor everything else hangs off.

### TestBatch
A user-grouped set of test sessions (Phase 3.5) — e.g. "ran Finger Tapping, Reaction Time, and Target Tapping back to back." Exists so the LLM explanation layer (below) makes one call per batch instead of one per session, since that AI call — not Phase 3's free statistics — is the only metered step in the pipeline.

| field | notes |
|---|---|
| `id` | |
| `userId` | FK → User |
| `name` | nullable — user-supplied label |
| `createdAt` | |

A batch has no status field — it's just however many sessions it has so far.

### RawEvent
The raw time-series table for discrete-event tests (tapping, reaction time, target tapping, finger tracing).

| field | notes |
|---|---|
| `id` | |
| `sessionId` | FK → TestSession |
| `seq` | monotonic sequence number within session — don't rely on timestamp ordering alone |
| `eventType` | `TouchDown` / `TouchUp` / `StimulusShown` (Reaction Time) / `TargetShown` (Target Tapping) / `TouchMove` (Finger Tracing) / ... |
| `tMs` | timestamp relative to session start, milliseconds, client-clock |
| `x`, `y` | nullable, and their meaning depends on `eventType`: touch position for `TouchDown`/`TouchUp`/`TouchMove`, the target's spawn position for `TargetShown`; null for events with no position at all (e.g. `StimulusShown`) |
| `pointerId` | nullable — only meaningful for `TouchDown`/`TouchUp`/`TouchMove` |

Finger Tracing's `TouchMove` samples are client-side throttled (~40ms) rather than recorded on every native move callback, to keep event counts bounded within the row-per-event model instead of reopening the storage question continuous sensor streams need (see below).

**Design decision — relational rows vs blob, for MVP:** store raw events as normalized rows (one row per event) rather than a JSON blob column or object storage. For finger tapping specifically: event count per session is small (tens, not thousands+), it lets you query/inspect raw data trivially with SQL during MVP verification, and it avoids a premature storage abstraction before it's proven necessary.

### SensorSession
The raw storage table for continuous accelerometer/gyroscope streams (`PhoneStability`, `GuidedMovement`) — one row per session, not one row per sample.

| field | notes |
|---|---|
| `id` | |
| `sessionId` | FK → TestSession, unique (one `SensorSession` per session) |
| `samples` | JSON array of `{ tMs, ax, ay, az, gx, gy, gz }`, ordered by `tMs` |

See `decisions/0003-raw-event-storage-model.md` for why this is JSONB rather than row-per-sample or blob storage, and how ingestion is kept storage-agnostic so a later migration stays localized.

### MLResult
Structured, versioned output of the Phase 3 ML service (`services/ml`) — one row per (session, model version). Written by the NestJS API via Prisma, like every other table — `services/ml` is a stateless HTTP service with no database access; the backend calls it and saves the result itself (see `decisions/0006-ml-trigger-mechanism.md`).

| field | notes |
|---|---|
| `id` | |
| `sessionId` | FK → TestSession |
| `modelId` | e.g. `"signal-features"` — identifies which computation produced this row |
| `modelVersion` | version of that computation, bumped when the math changes |
| `metrics` | JSON, test-type-specific `{ metric: value }` payload — see below for what each test type computes |
| `computedAt` | |

`(sessionId, modelId, modelVersion)` is unique — reprocessing a session under the same model/version is a no-op-by-construction, and a version bump just adds new rows next to the old ones rather than overwriting, keeping every past result reproducible.

**What `metrics` contains, per test type** (Phase 3 scope — plain descriptive statistics, never a diagnostic label):
- `fingerTapping`: tap count, inter-tap-interval mean/median/SD/coefficient-of-variation, mean tap duration, tap rate, fatigue slope.
- `reactionTime`: per-trial RT mean/median/SD/coefficient-of-variation, fastest RT, lapse count.
- `targetTapping`: hit accuracy (touch-to-target distance), movement time mean/SD.
- `fingerTracing`: path deviation mean/max, completion time, smoothness (mean jerk).
- `phoneStability`: gravity-removed acceleration RMS, dominant frequency + power (FFT/PSD), gyroscope RMS.
- `guidedMovement`: per-prompt response latency, peak angular velocity, directional correctness.

There is no `MLFeatureSet` table — an earlier draft of this doc sketched features and results as two separate tables, but Phase 3 has no second consumer that needs "features" distinct from "results" (the computation *is* the result), so they were collapsed into the one `MLResult` table above rather than building a speculative split. Revisit only if a real second consumer of raw features (distinct from the computed metrics) shows up.

### LLMExplanation
Structured, versioned output of the Phase 4 LLM service (`services/llm-explain`) — one row per (batch, model, model version), not per session/`MLResult`: the whole reason `TestBatch` was built before this phase was to make one AI call per batch. Written by `apps/api`'s `LlmService`, the same way `MlService` owns `MLResult` — `services/llm-explain` is a stateless HTTP service with no database access.

| field | notes |
|---|---|
| `id` | |
| `batchId` | FK → TestBatch |
| `modelId` | e.g. `"llama-3.1-8b-instruct"` |
| `modelVersion` | prompt/model version, bumped when either changes |
| `explanationText` | |
| `generatedAt` | |

`(batchId, modelId, modelVersion)` is unique — same reproducibility idiom as `MLResult`: a prompt or model change adds new rows rather than overwriting, so old explanations stay as history under the version that actually produced them.

Kept explicitly separate from `RawEvent`/`SensorSession`, never derived-in-place or mixed into them, so raw data stays untouched and replayable no matter how many times ML/LLM models are re-run or replaced.

### BaselineResult
Structured, versioned output of Phase 5a's personal-baseline comparison — one row per (`MLResult`, model, model version). Written by `apps/api`'s `BaselineService`, calling `services/ml`'s stateless `/baseline` endpoint (no DB access there), same shape as `MLResult`/`LLMExplanation`.

| field | notes |
|---|---|
| `id` | |
| `mlResultId` | FK → MLResult — **not** `sessionId`. Tying this to the specific `MLResult` row (rather than the session it came from) means a future bump to `MlService`'s own `MODEL_ID`/`MODEL_VERSION` can't leave a stale `BaselineResult` looking "already computed" for a session whose metrics were actually recomputed under a new model version — the pending-check in `BaselineService.computePendingForBatch` looks for a `BaselineResult` on *that* `MLResult`, not just on the session. |
| `modelId` | `"personal-baseline-zscore"` |
| `modelVersion` | version of the baseline computation, bumped when the math changes |
| `baselineSampleSize` | how many prior sessions (same user, same `testType`, same ML model/version) went into the comparison |
| `metrics` | JSON, `{ metricKey: { value, baselineMean, baselineSd, zScore, isAnomalous, favorable } }` — only for metric keys with enough history (see below) |
| `computedAt` | |

`(mlResultId, modelId, modelVersion)` is unique — same reproducibility idiom as `MLResult`/`LLMExplanation`.

**Method (Phase 5a scope — plain per-user z-score, not a trained model):** for each numeric key in the current session's `MLResult.metrics`, compute the mean/SD of that same key across the user's own prior sessions of the same `testType` (under the same ML `modelId`/`modelVersion`, current session excluded), then `zScore = (current - mean) / sd`, `isAnomalous = |zScore| > 2.0`. Requires at least 3 prior data points per metric — below that, the metric is simply omitted from `metrics` (not an error); `baselineSampleSize` still reports the actual history size so callers can tell "not enough data yet" apart from "nothing anomalous." A zero-SD history returns `zScore = 0`, not anomalous, rather than dividing by zero.

Deliberately generic over metric names — no per-test-type special-casing, since every test type's `MLResult.metrics` is already a flat `{name: number}` dict.

**`favorable` (added when this data was surfaced to the LLM layer):** `isAnomalous` is direction-agnostic — it fires just as easily for "much faster than usual" as "much slower than usual," and a large *favorable* deviation is good news, not a caution. Whether lower or higher is the better direction is a fact about the metric itself, so it's looked up from a small, explicit `METRIC_DIRECTION` table in `services/ml/mino_ml/baseline.py` (`"lower_is_better"` / `"higher_is_better"` / not listed) rather than left for a prompt to infer. `favorable` is `true`/`false` when the metric has a known direction, `null` when it doesn't (e.g. `dominantFrequencyHz`, `fatigueSlopeMsPerTap`'s cousins with no established direction) — a metric not in the table fails safe to `null` rather than guessing. Only meaningful when `isAnomalous` is true.

**Explicitly out of scope for this table/slice:** comparison against a population norm or clinical threshold — deferred, see `roadmap.md`'s Phase 5 scope note. (Surfacing this data to `services/llm-explain` and mobile UI is discussed below.)

## MVP scope boundary

MVP (Phase 1) implements only `User`, `TestSession`, `RawEvent`. It does **not** compute or store any derived score/metric — no `tapCount` or `avgInterval` column on `TestSession`, even though it's tempting. That boundary must stay crisp from day one so the raw/derived separation isn't quietly violated in the very first feature.
