# 0004 — Batched HTTP transport (not streaming)

**Status:** confirmed (Phase 2, subphase 2.4 — reviewed against real sensor payload sizes)

## Context
Raw session data needs to move from mobile to backend. A finger-tapping session is short (seconds) and small (tens of events).

## Decision
Buffer the session client-side and submit as one batched JSON payload via HTTPS POST on session completion. No WebSocket/streaming/chunked-upload transport for MVP.

## Consequences
Streaming would be unwarranted complexity for this data volume — the kind of speculative capability CLAUDE.md's "simplicity first" principle warns against. Revisit only if a later test type (e.g. guided movement, which can run longer and produce continuous sensor data) makes client-side memory buffering a real constraint — even then, periodic chunked batching (e.g. every N seconds) is likely sufficient before reaching for true streaming.

**Reviewed in 2.4 with real numbers:** Phone Stability (the first continuous-sensor test type) buffers a 15s session at ~50Hz ≈ 750 samples. Measured on an actual device this came to ~124KB as JSON — higher than the original speculative "well under 100KB" estimate, because JSON float precision per sample adds up across hundreds of samples. That exceeded Express's default 100kb `body-parser` limit, causing a hard `PayloadTooLargeError` on real device testing (not caught by our own `sensorSamples` array-size validation, since Express rejects the request body before it reaches our handler). Fixed by explicitly raising the limit in `main.ts` (`app.use(json({ limit: '5mb' }))`, sized with headroom for the DTO's `ArrayMaxSize(10000)` cap). Batched-on-completion transport itself still holds — a single POST comfortably carries even a much longer guided-movement session — but the lesson is to size the server's body limit explicitly rather than relying on the framework default, since that default is well below what a real sensor session produces.
