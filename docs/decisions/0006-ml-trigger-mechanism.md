# 0006 — ML trigger mechanism: polling, not a queue

**Status:** resolved (Phase 3)

## Context
`decisions/0005-kafka-deferred.md` deferred choosing how new sessions get picked up for ML processing, explicitly asking for this to be revisited once Phase 3 (the ML service) is actually being built, and to evaluate simpler mechanisms (a scheduled polling job, a Postgres-backed job table, a managed queue) before Kafka.

Phase 3's `services/ml` needs to find `TestSession` rows that don't have a result yet, process them, and write an `MLResult` row.

## Decision
A plain polling loop: the Python service wakes up on a fixed interval (default 30s), runs one query —

```sql
SELECT ts.id FROM "TestSession" ts
LEFT JOIN "MLResult" mr
  ON mr."sessionId" = ts.id AND mr."modelId" = :modelId AND mr."modelVersion" = :modelVersion
WHERE ts.status = 'Completed' AND mr.id IS NULL
```

— and processes whatever it finds, one session at a time. The absence of a matching `MLResult` row *is* the queue; no separate job/queue table is needed.

Rejected alternatives:
- **Postgres-backed job table** (from 0005's own list) — adds a schema and a state machine (pending/processing/done) for no benefit at this scale; the "no result row yet" check already gives an idempotent, restart-safe queue for free.
- **LISTEN/NOTIFY** — lower latency, but requires a long-lived listener process with reconnect handling. Not worth the complexity for a batch/async wellness-app pipeline where a session's result appearing 30s late is invisible to the user (there's no UI reading it yet — see `roadmap.md` Phase 3 scope).
- **Kafka** — 0005's reasoning still holds and is reinforced now with a concrete instance: at solo-developer/early-user scale, a 30s poll is more than fast enough, and Kafka's operational overhead buys nothing here.

## Consequences
Revisit only if polling latency becomes an actual user-facing problem (e.g. once results are shown in the app and users notice the delay) or once session volume is high enough that repeated polling queries become expensive — neither is true yet. If revisited, LISTEN/NOTIFY is the natural next step before reaching for a managed queue or Kafka.
