# Mino Data Model

Guiding rule (from CLAUDE.md): preserve raw data whenever practical, and keep it strictly separate from derived/ML features. This doc sketches the shape of the model — it should be kept in sync with the real Prisma schema as it evolves, since it changes at a different cadence (every schema change) than `architecture.md` (changes rarely).

## Core entities

### User
Minimal for MVP: `id`, `deviceId`, `createdAt`. No real auth for MVP — resolved decision (see Phase 1 plan): a client-generated UUID persisted on-device is the identity, upserted into `User` on first submission. Real authentication is deferred until multi-user/production need arises.

### TestSession
One row per completed (or attempted) test run.

| field | notes |
|---|---|
| `id` | |
| `userId` | FK → User |
| `testType` | enum; `FingerTapping`, `ReactionTime`, `TargetTapping`, `FingerTracing`, `PhoneStability`, `GuidedMovement` |
| `startedAt` / `endedAt` | |
| `clientAppVersion` | |
| `deviceMetadata` | JSON: OS, model — useful for later data-quality analysis |
| `status` | `Completed` / `Aborted` |
| `testParams` | nullable JSON — static per-session config that isn't itself a time-series, e.g. Finger Tracing's reference path (`{ referencePath: {x,y}[] }`). Distinct from `RawEvent`'s timestamped stream: this is set once at session start, not sampled over time. Null for test types that don't need it. |

Natural foreign-key anchor everything else hangs off.

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

## Derived/LLM tables (not built until Phase 4 — named here for clarity)

- **LLMExplanation** — `id`, `ml_result_id` (FK), `explanation_text`, model/prompt version, `generated_at`.

Kept explicitly separate from `RawEvent`/`SensorSession`, never derived-in-place or mixed into them, so raw data stays untouched and replayable no matter how many times ML models are re-run or replaced — a model version bump just adds new `MLResult` rows referencing the same immutable raw session.

## MVP scope boundary

MVP (Phase 1) implements only `User`, `TestSession`, `RawEvent`. It does **not** compute or store any derived score/metric — no `tapCount` or `avgInterval` column on `TestSession`, even though it's tempting. That boundary must stay crisp from day one so the raw/derived separation isn't quietly violated in the very first feature.
