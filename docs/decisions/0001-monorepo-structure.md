# 0001 — Monorepo structure

**Status:** proposed

## Context
Mobile, backend, and (later) ML are tightly coupled by data contracts (event schema, API shape) during a fast-moving early phase with a solo/small team.

## Decision
Use a single monorepo: `apps/mobile`, `apps/api`, `packages/shared-types`, later `services/ml`. Shared TypeScript types (e.g. the RawEvent payload shape) live in one place instead of duplicated/drifting across repos. Tooling choice (Nx, Turborepo, or plain workspaces) is a Phase 0 implementation detail, not decided here.

## Consequences
Revisit if/when the ML service or team structure grows enough to want independent deploy cadences and repo-level access control — not a concern at MVP scale.
