# Mino Architecture

## Long-term system architecture

```
┌──────────────────────────┐
│   Mobile App (RN + TS)   │  - Renders test UI, captures raw touch/sensor events
│                          │  - Buffers a session locally, batches to backend
└────────────┬─────────────┘
             │ HTTPS (batched JSON, authenticated)
             ▼
┌──────────────────────────┐
│   Backend API (NestJS)   │  - AuthN/AuthZ, session/user management
│                          │  - Validates & persists raw session payloads
│                          │  - Sole gateway to ML/LLM; exposes results/history
│                          │    to mobile
└──┬───────────────────┬───┘
   │ Prisma             │ synchronous HTTP: POST /compute, on demand
   ▼                    │ (viewing a batch) or via a background sweep
┌─────────────┐         ▼
│ PostgreSQL   │   ┌──────────────────────────┐
│ (raw +       │   │  ML Service (Python)     │  - stateless Flask HTTP
│  derived     │   │                          │  - POST /compute: raw data in,
│  tables)     │   │                          │    structured metrics out
└─────────────┘   │                          │  - no database access at all
                    └──────────────────────────┘
                    Backend saves the returned metrics as MLResult —
                    it's the only thing that ever writes that table.

The LLM Explanation Service (Phase 4, built — see `decisions/0007-llm-hosting-and-guardrail.md`) is called by the backend the same way — synchronous HTTP to a stateless service, one call per `TestBatch` rather than per session — and its result is relayed back to mobile:

┌──────────────────────────┐
│  LLM Explanation Service │  - consumes ONLY structured MLResult rows,
│  (services/llm-explain,  │    never raw session data
│   hosted on Modal)       │  - produces a plain-language explanation
│                          │  - guardrail: diagnostic-style language is
│                          │    allowed only paired with a clear
│                          │    not-a-doctor disclaimer (checked before
│                          │    any text leaves the service)
└──────────────────────────┘
```

Key properties this architecture preserves, per CLAUDE.md's separation-of-concerns principle:

- **ML is a separate, stateless service**, called over plain HTTP — never inline logic in the main API's request path, and never given database access. The backend reads raw data, calls it, and writes back the structured, versioned result itself — see `decisions/0006-ml-trigger-mechanism.md` for why this is a direct call rather than a queue/broker.
- **LLM sits downstream of ML only** — it never touches raw sensor data or makes its own inferences from numbers; it only ever explains what ML already computed. This is enforced architecturally (the LLM service's only input contract is the `MLResult` schema), not just by prompt instruction. It may now venture a diagnostic-style suggestion (per CLAUDE.md), but only paired with a clear not-a-doctor disclaimer — that pairing, not a blanket ban on diagnostic language, is what `services/llm-explain`'s guardrail actually enforces.
- **Personal-baseline comparison (Phase 5a) is also ML's job, not application logic** — `services/ml` exposes a second stateless endpoint, `POST /baseline`, that takes a user's own history of past `MLResult.metrics` plus the current session's metrics and returns per-metric z-scores/anomaly flags. Same properties as `/compute`: no database access, called on demand by the backend (`BaselineService`, mirroring `MlService`), which persists the result as `BaselineResult`. This keeps the door open to later replace the simple z-score math with a pretrained/fitted model without changing `apps/api`'s contract. Population-norm/clinical-threshold comparison and surfacing this data to mobile/LLM are both deliberately deferred — see `roadmap.md`'s Phase 5 scope note.
- **Backend is the sole gateway** — mobile never talks to ML or LLM directly. Keeps auth, versioning, and rate-limiting in one place, and keeps ML/LLM freely replaceable without touching the mobile app.
- **LLM is hosted on Modal from the start**, unlike `services/ml` (still local-only/dev): generating a real explanation needs a GPU to run an 8B-class instruct model, so there's no practical local-CPU fallback. `LLM_SERVICE_URL` points at a `modal serve` dev endpoint in development and a `modal deploy` endpoint in production, the same pattern `ML_SERVICE_URL` uses for `services/ml`.

## MVP-phase architecture (Phase 1)

For Phase 1, the diagram collapses to:

```
Mobile App (RN+TS) --HTTPS batched POST--> NestJS API --Prisma--> PostgreSQL
```

No Kafka, no ML service, no LLM service, no Azure resources beyond (eventually) a hosted Postgres and a place to run the API — even those can be local/dev-only for the MVP milestone. This is the concrete application of "build the minimum required": everything in the long-term diagram beyond this line is explicitly out of scope until its corresponding phase (see `roadmap.md`).

## Component responsibilities

- **Mobile (React Native + TypeScript)**: renders test UI, captures raw touch/sensor events client-side, buffers a session, batches and submits to the backend. Never computes scores or talks to ML/LLM directly.
- **Backend (NestJS + TypeScript)**: auth, session/user management, payload validation, persistence via Prisma, exposes results/history to mobile. Sole gateway to ML/LLM.
- **Database (PostgreSQL + Prisma)**: stores raw data and derived data in clearly separated tables (see `data-model.md`).
- **ML (Python)**: a stateless Flask HTTP service (`services/ml`) — takes one session's raw data, returns computed metrics, has no database access at all. Independent, replaceable — see `decisions/` for how this is enforced. The backend is the only thing that reads/writes `MLResult`: it calls this service on demand (when a batch detail view finds pending results) and via a periodic background sweep (for sessions nobody has viewed yet) — no queue/broker in between (see `decisions/0006-ml-trigger-mechanism.md`). The same service also exposes `POST /baseline` (Phase 5a): given a user's own metric history plus a current session's metrics, returns per-metric z-scores/anomaly flags. The backend's `BaselineService` calls it on demand only (no background sweep — see `data-model.md`'s `BaselineResult`) and writes `BaselineResult`.
- **LLM** (`services/llm-explain`, hosted on Modal): explains ML's structured output in plain language. Never sees raw data — only `MLResult`-shaped metrics. May suggest a possible condition when results look concerning, but only paired with a clear not-a-doctor disclaimer (see `decisions/0007-llm-hosting-and-guardrail.md`).

See `decisions/` for the specific architectural decisions (monorepo layout, RN workflow, transport, Kafka timing, storage model) and their rationale.
