# Lessons & Session Notes

Append-only running log, updated at the end of each development session per CLAUDE.md's "Continuous Improvement" process: review what was implemented, review feedback/corrections/problems, identify reusable lessons or architectural decisions, and record them here (or promote them to a formal ADR in `decisions/` if they represent a fundamental decision).

---

## 2026-09-02 — Initial roadmap & architecture planning

- Repo started empty; this session produced the initial `docs/` structure (roadmap, architecture, data model, ADRs 0001-0005, testing criteria) before any code was written.
- Key scoping decisions made with the user: MVP = single test (finger tapping) end-to-end, no ML/LLM until Phase 3/4, documentation-only for this pass.
- Open question carried forward (not yet resolved): auth strategy for `User` — recommended starting with a simple device UUID, no real auth, until multi-user/production need arises.
