# 0003 — Raw event storage model

**Status:** proposed (MVP scope only — open question for Phase 2)

## Context
CLAUDE.md requires preserving raw touch/sensor time-series data. Different test types produce very different data volumes: finger tapping produces tens of discrete events per session; continuous sensor tests (phone stability, guided movement) will produce thousands of samples per session at 50-100Hz.

## Decision
For MVP (discrete-event tests: tapping, later reaction time and target tapping): store raw events as normalized relational rows, one row per event, in a `RawEvent` table (see `data-model.md`). This keeps raw data trivially queryable/inspectable via SQL, which is exactly what MVP verification needs, and avoids building a blob/columnar storage pipeline before it's proven necessary.

## Consequences
This will very likely need reconsideration in Phase 2 for continuous sensor streams — row-per-sample relational storage doesn't scale well to thousands of rows per session. Candidates to evaluate then: a compressed serialized array per session (Parquet/Arrow in blob storage), or a JSONB array column as a middle ground. This is intentionally left as an open decision, not resolved speculatively now.
