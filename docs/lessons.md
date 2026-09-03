# Lessons & Session Notes

Append-only running log, updated at the end of each development session per CLAUDE.md's "Continuous Improvement" process: review what was implemented, review feedback/corrections/problems, identify reusable lessons or architectural decisions, and record them here (or promote them to a formal ADR in `decisions/` if they represent a fundamental decision).

---

## 2026-09-02 — Initial roadmap & architecture planning

- Repo started empty; this session produced the initial `docs/` structure (roadmap, architecture, data model, ADRs 0001-0005, testing criteria) before any code was written.
- Key scoping decisions made with the user: MVP = single test (finger tapping) end-to-end, no ML/LLM until Phase 3/4, documentation-only for this pass.
- Open question carried forward (not yet resolved): auth strategy for `User` — recommended starting with a simple device UUID, no real auth, until multi-user/production need arises.

## 2026-09-02 — Phase 0 scaffolding

- Set up npm workspaces monorepo (`apps/mobile` via Expo, `apps/api` via NestJS, `packages/shared-types`), `docker-compose.yml` for local Postgres, and `apps/api/prisma/schema.prisma` (datasource/generator only, per the Phase 0/Phase 1 boundary in the roadmap).
- Decisions made with the user for this phase: npm workspaces (not pnpm/Turborepo), CI skipped for now (no remote yet), Postgres via Docker Compose.
- **Upstream bug found and fixed**: the current Nest CLI scaffold (`@nestjs/cli` v12 template) generates `apps/api/test/app.e2e-spec.ts` importing `App` from `supertest/types` — that subpath does not exist in any published `supertest` version up to and including the current latest (7.2.2). Fixed by dropping the import and using the default `INestApplication` generic. Worth rechecking if `@nestjs/cli` or `supertest` publish a fix later.
- Docker Desktop was not running earlier in this session; once started, `docker compose up -d` and a live Prisma connectivity check (`prisma validate` + `prisma db execute` running `SELECT 1`) both succeeded. Phase 0 is now fully done.

## 2026-09-02 — Phase 1 implementation: finger-tapping MVP

- **Casing correction (important, caught during plan review, not by me):** the initial Phase 1 plan drafted the Prisma schema in snake_case to match `data-model.md`/`testing.md`'s field-name tables literally. The user correctly rejected this — those docs were written before any real schema existed and were themselves wrong, not a source of truth to be matched. Since this is a pure TypeScript stack end-to-end (RN mobile talking to a NestJS backend it owns), the fix was to make everything camelCase (Prisma fields, `shared-types` wire contract, DTOs) and PascalCase for enum members, then correct the docs to match the real, idiomatic schema. Lesson: when a doc and an idiomatic-convention decision conflict, prefer the convention and fix the doc — don't contort code to match a doc that predates the decision.
- Implemented and verified end-to-end: Prisma schema (`User`/`TestSession`/`RawEvent`, camelCase fields + PascalCase enums), `PrismaService`/`PrismaModule`, `POST /sessions` ingestion endpoint with `class-validator` DTOs + a global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`), service-level physical-plausibility checks (event count vs. session duration, `tMs` bound), and a `sessions.e2e-spec.ts` integration test suite (5 tests) run against a dedicated `mino_test` Postgres database via `dotenv-cli` + `prisma migrate deploy`.
- Mobile: `TappingScreen.tsx` captures touch down/up events with `performance.now()`-relative timestamps (chosen specifically to avoid iOS/Android native-timestamp epoch differences), persists a device UUID via `expo-crypto` + `AsyncStorage` as the MVP's non-auth identity, and submits the batch to the API on session completion. Verified by type-checking cleanly and bundling successfully for web (241 modules, no errors) — actually tapping through a live session on a simulator/device is a manual step, not something I can automate from here.
- RN's `GestureResponderEvent.nativeEvent.identifier` (touch pointer id) is typed as `string` in this React Native version, not `number` — had to `Number(...)`-convert it before storing as `pointerId`.
- Metro (RN's bundler) resolves imports without file extensions; the NestJS backend's `nodenext` ESM setup requires explicit `.js` extensions on relative imports. Mixed these up once while scaffolding mobile files — worth remembering these are two different module-resolution worlds within the same monorepo.
