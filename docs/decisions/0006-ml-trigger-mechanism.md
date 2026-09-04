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

## Update (Phase 3.5 addendum) — LISTEN/NOTIFY added

Once Phase 3.5's batch detail screen made results user-facing (a "waiting for results" spinner the user actually watches), the 30s interval became a real, noticed delay — the condition above for revisiting. Rather than replace polling, `apps/api`'s `SessionsService.create` now also does `NOTIFY mino_new_session` after a session is saved, and the poller keeps a second, dedicated `autocommit` connection LISTENing on that channel (`services/ml/mino_ml/db.listen_connection`); `run_forever`'s sleep became `listen_conn.notifies(timeout=interval_seconds)`, so it wakes immediately on a notification but still falls back to the fixed interval if one is ever missed (e.g. the listener reconnecting).

This keeps the "absence of a matching `MLResult` row is the queue" property exactly as before — NOTIFY is purely a wake-up signal, not a source of truth, so a missed or duplicate notification is harmless. The one new risk this introduces is two processes computing the same session at once (e.g. `run_once.py` run manually while the continuous poller is also listening) — `MLResult`'s insert now uses `ON CONFLICT ("sessionId", "modelId", "modelVersion") DO NOTHING` to make that race a safe no-op rather than a crash.

## Update 2 — on-demand compute from the API, since NOTIFY still assumes a poller exists

NOTIFY only wakes a poller that is already running — it does nothing if `services/ml` was never started, which turned out to be the actual everyday failure mode in dev (nobody remembers to run a second process in a second terminal), not just the 30s latency the first update addressed. Since the batch detail screen makes this failure directly user-visible ("waiting for results" forever, not just slow), `BatchesService.findOneForDevice` (`apps/api/src/batches/batches.service.ts`) now also runs `uv run python -m mino_ml.run_once` itself, synchronously, whenever it finds a session in the requested batch with no result yet — awaited with a 15s timeout, and de-duplicated so concurrent requests share one in-flight run rather than spawning several.

This does couple the API to a Python/`uv` install on the same host, which the continuous poller was deliberately kept independent of — acceptable for now since both processes still run on one dev machine, but worth revisiting before a real multi-container deployment (Azure), at which point this on-demand call would need to go over the network (e.g. the small-HTTP-endpoint option considered and passed over earlier) rather than shelling out locally. The continuous poller and NOTIFY wake are unchanged and still the primary path if `services/ml` is left running — the on-demand call is strictly a fallback for "nothing is listening at all."

## Update 3 — services/ml becomes a stateless Flask service; poller and NOTIFY removed

Two more requirements pushed this further: (1) the ~1.3-1.4s per-call cost of Update 2's subprocess spawn is real, felt latency for someone waiting on the batch detail screen — measured against sub-100ms actual computation time, the overhead is pure Python/`uv` process startup; (2) Python should never write `MLResult` — the backend should be the only thing that ever touches Postgres for it, since that's also the shape the future Phase 4 LLM service should follow ("ml is just a service that calculates and responds").

**`services/ml` is now a stateless Flask app** with one endpoint, `POST /compute` — takes one session's raw data (`testType`, `rawEvents`, `sensorSamples`, `testParams`), returns its metrics. No Postgres access anywhere in Python. `db.py`, `poller.py`, `run_once.py`, and `__main__.py` are deleted, not deprecated.

**`apps/api` now owns the whole orchestration** (`MlService`, `apps/api/src/ml/`): finding sessions with no `MLResult` under the current `MODEL_ID`/`MODEL_VERSION`, loading their raw data via Prisma, calling `services/ml`, and saving the result. It's triggered two ways:
- **On demand** — `GET /batches/:id` computes just that batch's pending sessions synchronously, same intent as Update 2 but a fast HTTP call instead of a subprocess spawn.
- **Background** — a `@nestjs/schedule` cron (`MlService.sweepPending`, every 30s) computes whatever's pending system-wide, with bounded concurrency, for sessions nobody has opened a batch detail view for yet.

The `NOTIFY mino_new_session` call and `listen_connection()` from Update 1 are removed — the cron sweep already guarantees a bounded catch-up latency without needing a wake signal, and nothing is listening for it anymore.

**Why not a message broker for the background path.** Before landing on the cron, two transports were considered and rejected:
- **Kafka** — not naturally request/response. Getting a computed result back and saved would need a reply-topic/correlation-id layer on top, solving a problem plain HTTP already solves for free. A long-lived Kafka consumer is also in tension with ever hosting `services/ml` on Modal's scale-to-zero HTTP-endpoint model.
- **RabbitMQ** — does give real request/response (RPC pattern), but the durability it would add (Python being briefly down doesn't lose work) is something this design already has for free: the absence of an `MLResult` row *is* the queue, per this ADR's original decision. A failed compute call just leaves the session pending for the next cron tick or the next time someone views its batch — no broker needed to guarantee that.
- The other concern raised — one HTTP request carrying hundreds of pending sessions' raw data being too large — only exists if they're batched into one call. The cron sweep instead calls the same per-session endpoint the on-demand path uses, with bounded concurrency (5 at a time) rather than one giant payload.

Kafka isn't ruled out for the project generally — CLAUDE.md's guidance is to use it "where actually useful," and a genuinely async, no-one-waiting job like Phase 5's cross-session baseline/anomaly detection is a plausible future fit. It just isn't useful for this request/response-shaped path.

**Modal fit.** A stateless Flask app is exactly what `modal.wsgi_app()` wraps — deploying `services/ml` to Modal later is a thin wrapper file, not a rewrite. The same shape (plain stateless HTTP service now, Modal wrapper later) is the one to reuse for Phase 4's `services/llm-explain`.
