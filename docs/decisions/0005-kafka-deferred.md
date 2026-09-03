# 0005 — Kafka deferred until actually needed

**Status:** resolved — see `decisions/0006-ml-trigger-mechanism.md` (polling, not Kafka, not yet a queue)

## Context
CLAUDE.md is explicit: use Kafka only where async/event-driven processing is actually useful, not by default. Ingestion for Phase 0-2 is a synchronous request/response write to Postgres — there is no real async processing need yet.

## Decision
Do not introduce Kafka in Phases 0-2. The first plausible justification is Phase 3 (triggering ML batch jobs on new session data). Even there, evaluate simpler mechanisms first — a scheduled polling job, a Postgres-backed job table, or a managed queue (e.g. Azure Service Bus) — before committing to Kafka's operational overhead for a solo/small-team project.

## Consequences
Defer the Kafka-vs-simpler-queue decision explicitly to a Phase 3 ADR rather than deciding now. This decision should be revisited (not assumed resolved) once Phase 3 is actually being implemented.
