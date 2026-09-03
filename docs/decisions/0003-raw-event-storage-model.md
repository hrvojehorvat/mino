# 0003 — Raw event storage model

**Status:** resolved (Phase 2, subphase 2.4)

## Context
CLAUDE.md requires preserving raw touch/sensor time-series data. Different test types produce very different data volumes: discrete-event tests (tapping, reaction time, target tapping, finger tracing) produce tens to low-hundreds of discrete events per session; continuous sensor tests (phone stability, guided movement) produce thousands of samples per session at 50-100Hz.

## Decision
Two storage shapes, split by data shape rather than one model forced to fit both:

- **Discrete-event tests:** normalized relational rows, one row per event, in `RawEvent` (see `data-model.md`). Unchanged from the original MVP decision — keeps raw data trivially queryable/inspectable via SQL.
- **Continuous sensor tests:** one row per session in a new `SensorSession` table, with the full sample array stored as a JSONB column (`samples: Json`) rather than row-per-sample or blob storage. At realistic volumes (a 15-30s session at 50-100Hz ≈ 750-3000 samples, roughly 150-300KB serialized) this comfortably fits Postgres without needing new infra (Azure Blob stays deferred, per Phase 0's decision), and avoids thousands of `RawEvent`-style rows per session that row-per-sample storage would produce.

To keep a later migration to blob storage cheap if sensor volume grows well beyond this, ingestion is kept storage-agnostic behind one method: `SensorSessionsService.storeSamples(sessionId, samples)`. A future swap to "write to Azure Blob, store the URL" only touches that method's internals — the API request/response shape (`sensorSamples` on `POST /sessions`) and the mobile client never change.

## Consequences
Two raw-storage tables now exist (`RawEvent`, `SensorSession`) instead of one, matching the two genuinely different data shapes rather than forcing continuous streams into row-per-sample or discrete events into a blob. If sensor session duration or sample rate grows substantially (e.g. minutes-long sessions, higher-frequency sampling), JSONB row size is the thing to watch — `SensorSessionsService.storeSamples` is the one place a blob-storage migration would happen.
