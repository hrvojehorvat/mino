# 0004 — Batched HTTP transport (not streaming)

**Status:** proposed

## Context
Raw session data needs to move from mobile to backend. A finger-tapping session is short (seconds) and small (tens of events).

## Decision
Buffer the session client-side and submit as one batched JSON payload via HTTPS POST on session completion. No WebSocket/streaming/chunked-upload transport for MVP.

## Consequences
Streaming would be unwarranted complexity for this data volume — the kind of speculative capability CLAUDE.md's "simplicity first" principle warns against. Revisit only if a later test type (e.g. guided movement, which can run longer and produce continuous sensor data) makes client-side memory buffering a real constraint — even then, periodic chunked batching (e.g. every N seconds) is likely sufficient before reaching for true streaming.
