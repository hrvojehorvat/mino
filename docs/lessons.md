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
