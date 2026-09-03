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
| `testType` | enum; `FingerTapping`, `ReactionTime`, `TargetTapping`, `FingerTracing`, ... |
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

**Flagged for a Phase 2 decision, not resolved now:** continuous sensor streams (phone stability, guided movement) at 50-100Hz over tens of seconds mean thousands of rows/session — very likely to outgrow row-per-sample relational storage. Candidates to evaluate then: one row per session with a compressed serialized array (Parquet/Arrow in blob storage), or a JSONB array column as a middle ground. Don't build that generality now.

## Derived/ML tables (not built until Phase 3/4 — named here for clarity)

- **MLFeatureSet** — `id`, `session_id` (FK), `model_id`/`version`, `computed_at`, feature payload.
- **MLResult** — `id`, `session_id` (FK), `model_id`/`version`, structured result payload (e.g. `{ metric: "tap_consistency", value: 0.82, ... }`), `computed_at`.
- **LLMExplanation** — `id`, `ml_result_id` (FK), `explanation_text`, model/prompt version, `generated_at`.

These are explicitly separate tables from `RawEvent`, never derived-in-place or mixed into it, so raw data stays untouched and replayable no matter how many times ML models are re-run or replaced — a model version bump just adds new rows referencing the same immutable raw session.

## MVP scope boundary

MVP (Phase 1) implements only `User`, `TestSession`, `RawEvent`. It does **not** compute or store any derived score/metric — no `tapCount` or `avgInterval` column on `TestSession`, even though it's tempting. That boundary must stay crisp from day one so the raw/derived separation isn't quietly violated in the very first feature.
