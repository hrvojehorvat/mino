# Mino

**Short, game-like phone tests that measure fine motor control and reaction speed, and track how a person changes against their own baseline.**

Mino is an experimental HealthTech / wellness app. Users do brief tests on their phone: tapping, reacting, tracing and holding the phone steady. The app records the **raw touch and motion-sensor time series** behind each test, not just a final score. A separate analysis service turns that raw data into structured metrics and compares them with the user's own history. A language model then explains the results in plain language.

> ⚠️ Mino is an experimental wellness product, **not a medical device** and not a substitute for professional medical advice. Any diagnostic-style wording the app produces always comes with a clear "not a doctor" disclaimer, and the system checks for that disclaimer itself (see [LLM guardrail](#llm-layer-with-an-enforced-guardrail)).

---

## The tests

| Test | What it captures | Data type |
|---|---|---|
| Finger tapping | Speed, rhythm, consistency, accuracy | Touch events |
| Reaction time | Response latency over multiple trials, lapses | Touch events |
| Target tapping | Hand-eye coordination, spatial accuracy | Touch events |
| Finger tracing | Deviation from a reference path | Touch events + reference path |
| Phone stability | Tremor and steadiness while holding the phone | Accelerometer + gyroscope |
| Guided movement | Response to on-screen movement prompts | Accelerometer + gyroscope |

Users can run several tests back to back as a **batch**, then look at their history, per-test metrics, how each result compares with their own baseline, and a plain-language explanation.

---

## Architecture

```
 Mobile app (React Native + TS)      captures raw touch / sensor events
          │  HTTPS, batched JSON, JWT
          ▼
 Backend API (NestJS + TS)           auth, validation, persistence; the only
          │                          gateway to the analysis services
    ┌─────┼──────────────────────┐
    ▼     ▼                      ▼
 PostgreSQL     Analysis service (Python)     LLM explanation service (Python)
 (Prisma)       stateless HTTP, no DB         stateless HTTP, GPU-hosted
 raw + derived  raw data in → metrics out     metrics in → plain-language text
 data kept      + personal-baseline z-scores  + guardrail check
 separate
```

How the parts are divided:

- **Mobile collects data, the backend manages the flow, analysis computes, and the LLM explains.** Each layer has one job.
- **The analysis and LLM services are stateless and replaceable.** They have no database access, and each sits behind a small HTTP contract. A model can be swapped out without changing the mobile app or the database schema.
- **The LLM never sees raw data.** Its only input is the structured metrics output. The architecture enforces this; it doesn't depend on prompt wording.
- **Raw data is never overwritten by derived data.** Raw events and sensor samples are stored separately from computed results. Every result is versioned by `modelId` / `modelVersion`, so new models can be run again over historical data.

The full design is in [docs/architecture.md](docs/architecture.md), and the reasoning behind each choice is recorded in [docs/decisions/](docs/decisions/).

---

## Engineering highlights

### Raw-data-first storage
Discrete touch tests store one row per event (timestamp, coordinates, pointer id, event type). Continuous sensor tests store the ordered sample array as JSONB. That is a deliberate tradeoff between query flexibility and write volume, explained in [ADR 0003](docs/decisions/0003-raw-event-storage-model.md).

### Analysis service: signal processing today, ML-ready interface
`services/ml` currently computes **hand-built statistical and signal-processing features**, such as inter-tap interval variability, reaction-time lapses, path deviation and tremor energy. It has **no trained ML model yet**, and we say so plainly. It already has the interface a trained model would need: raw data in, versioned structured metrics out, no side effects. Every feature module is unit-tested against hand-calculated fixtures and was also checked against real on-device captures.

### Personal baseline instead of population norms
Each new result is compared with **the user's own history** for that test. The service computes per-metric z-scores and anomaly flags, and it marks whether a change is an improvement or a decline. It doesn't use population or clinical thresholds, which would be out of scope for a wellness product without clinical validation.

### LLM layer with an enforced guardrail
`services/llm-explain` runs an open-weight instruct model (vLLM on Modal, GPU). Before any text leaves the service, a guardrail checks the model's output. If the text uses diagnostic-style language without a not-a-doctor disclaimer, the service retries once with a stricter prompt. If the retry still fails, the service returns no text at all. Explanations are cached per batch and model version. A stdlib-only local stub implements the same contract, so development and tests never spend GPU credits. See [ADR 0007](docs/decisions/0007-llm-hosting-and-guardrail.md).

### Pragmatic about infrastructure
Kafka is in the target stack, but it was **deliberately left out** until event-driven processing actually pays off. For now the backend calls the analysis service directly over HTTP, on demand and through a background sweep. See [ADR 0005](docs/decisions/0005-kafka-deferred.md) and [ADR 0006](docs/decisions/0006-ml-trigger-mechanism.md).

### Testing
- **Backend:** end-to-end tests run against a real Postgres test database. They cover ingestion, validation, batches, authentication and ownership checks, baseline computation, and the exact payload the API sends to the LLM service.
- **Analysis:** pytest unit tests with exact hand-calculated expected values for each test type, plus baseline edge cases (not enough history, zero variance, missing metrics).
- **LLM:** fast deterministic guardrail and prompt tests, plus a separate evaluation set that runs against the real model on a GPU.
- **Manual on-device checks** are the final step for each phase. Real hardware caught bugs that synthetic fixtures missed, and those cases are written up in [docs/lessons.md](docs/lessons.md).

---

## Tech stack

| Layer | Technology |
|---|---|
| Mobile | React Native, Expo, TypeScript, expo-sensors |
| Backend | NestJS, TypeScript, Prisma, JWT auth, class-validator |
| Database | PostgreSQL 16 |
| Analysis | Python, Flask, gunicorn, NumPy, SciPy, pytest, uv |
| LLM | Python, vLLM, Modal (GPU serverless) |
| Infrastructure | Docker, GitHub Container Registry, Azure Container Apps, Azure Database for PostgreSQL, Azure Static Web Apps |
| Monorepo | npm workspaces with a shared TypeScript types package |

---

## Repository layout

```
apps/
  mobile/              React Native (Expo) app: test UIs and data capture
  api/                 NestJS backend: auth, ingestion, orchestration, Prisma schema
packages/
  shared-types/        Request/response types shared by mobile and API
services/
  ml/                  Stateless Python analysis service (/compute, /baseline)
  llm-explain/         LLM explanation service + guardrail + local dev stub
docs/
  architecture.md      System design
  data-model.md        Database schema and raw vs. derived data separation
  decisions/           Architecture decision records
  roadmap.md           Phase-by-phase status
  testing.md           Definition of done and test approach per phase
  lessons.md           Problems found and what changed because of them
  azure-deployment.md  Deployment runbook
```

---

## Status

| Phase | Status |
|---|---|
| End-to-end finger tapping (capture → API → Postgres) | ✅ Done |
| All six test types | ✅ Done |
| Analysis pipeline v1 (per-test metrics) | ✅ Done |
| Multi-test batches and history | ✅ Done |
| LLM explanations with guardrail | ✅ Done |
| Personal-baseline comparison | 🟡 In progress (core done) |
| Email/password authentication | ✅ Done |
| Azure deployment | 🟡 In progress (stack deployed, final end-to-end test pending) |

**Next:** trained and pretrained time-series models in place of the hand-built features, more varied tests (for example randomized tracing paths), and event-driven processing where it actually helps.

Detailed progress is in [docs/roadmap.md](docs/roadmap.md).

---

## Running locally

Requirements: Node 20+, Docker, Python with [uv](https://docs.astral.sh/uv/).

```bash
npm install
docker compose up -d                          # local Postgres

# Backend
cp apps/api/.env.example apps/api/.env
cd apps/api && npx prisma migrate deploy && npm run start:dev

# Analysis service (port 5001)
cd services/ml && uv run flask --app mino_ml.app run --port 5001

# LLM: local canned-response stub (port 5002, no GPU needed)
cd services/llm-explain && python3 -m mino_llm.dev_stub

# Mobile
cd apps/mobile && npm start
```

Checks:

```bash
npm run type-check                            # whole TS workspace
cd apps/api && npm run test:e2e               # needs the mino_test database
cd services/ml && uv run pytest
```
