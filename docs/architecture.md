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

The LLM Explanation Service (Phase 4, not yet built) is called by the
backend the same way — synchronous HTTP to a stateless service — and its
result is relayed back to mobile:

┌──────────────────────────┐
│  LLM Explanation Service │  - consumes ONLY structured MLResult rows,
│                          │    never raw session data
│                          │  - produces a plain-language explanation
│                          │  - guardrails: no diagnostic/medical language
└──────────────────────────┘
```

Key properties this architecture preserves, per CLAUDE.md's separation-of-concerns principle:

- **ML is a separate, stateless service**, called over plain HTTP — never inline logic in the main API's request path, and never given database access. The backend reads raw data, calls it, and writes back the structured, versioned result itself — see `decisions/0006-ml-trigger-mechanism.md` for why this is a direct call rather than a queue/broker.
- **LLM sits downstream of ML only** — it never touches raw sensor data or makes its own inferences from numbers; it explains what ML already concluded. This is enforced architecturally (the LLM service's only input contract is the `MLResult` schema), not just by prompt instruction — that's the real guardrail against diagnostic claims.
- **Backend is the sole gateway** — mobile never talks to ML or LLM directly. Keeps auth, versioning, and rate-limiting in one place, and keeps ML/LLM freely replaceable without touching the mobile app.

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
- **ML (Python)**: a stateless Flask HTTP service (`services/ml`) — takes one session's raw data, returns computed metrics, has no database access at all. Independent, replaceable — see `decisions/` for how this is enforced. The backend is the only thing that reads/writes `MLResult`: it calls this service on demand (when a batch detail view finds pending results) and via a periodic background sweep (for sessions nobody has viewed yet) — no queue/broker in between (see `decisions/0006-ml-trigger-mechanism.md`).
- **LLM**: explains ML's structured output in plain language. Never diagnoses, never sees raw data.

See `decisions/` for the specific architectural decisions (monorepo layout, RN workflow, transport, Kafka timing, storage model) and their rationale.
