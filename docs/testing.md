# Mino Testing & "Done" Criteria

Grows as test types/phases are added. Each phase should append its own "done" section here before being marked done in `roadmap.md`.

## Phase 1 — MVP: Finger Tapping

**Definition of done:**
1. A person can launch the mobile app on a simulator/device, start a finger-tapping session, complete it (session ends automatically after the fixed duration), and see a minimal completion confirmation in the UI.
2. Every touch-down/touch-up event during the session is captured client-side with timestamp, coordinates, and pointer id.
3. On session completion, the full event batch is submitted to the backend API, and a corresponding `TestSession` row plus one `RawEvent` row per captured event exist in Postgres — verifiable directly via SQL (`SELECT * FROM "RawEvent" WHERE "sessionId" = ...` returns exactly the expected event count, in correct sequence order).
4. Malformed/invalid submissions (missing fields, absurd event counts) are rejected by the API with a clear 4xx response, not silently accepted or crashing the server.
5. Type checks pass across the whole workspace (`tsc --noEmit` for mobile + backend), and at least the automated tests below exist and pass.

**Testing approach:**
- **Backend integration test (write this first, highest value):** spin up the NestJS app against a test Postgres (or Prisma's test-db pattern), POST a realistic tapping-session payload to the ingestion endpoint, assert the response and assert the DB rows via the Prisma client directly. This is the core "does the pipeline work" test — automated and repeatable in CI, not just manual.
- **Backend validation tests:** negative cases — missing `deviceId`, empty event list, event count wildly exceeding what's physically possible in the session duration — asserting proper rejection.
- **Mobile:** manual verification pass for MVP (run in simulator, perform a tapping session, confirm UI completes with no console errors). Full automated E2E (e.g. Detox) is out of scope for MVP per "simplicity first" — a candidate for a later phase once the app has more surface area worth protecting.
- **Manual end-to-end sanity check** as the final gate before calling Phase 1 done: real device or simulator run, followed by direct SQL inspection of the resulting rows, confirming event sequence/timestamps look sane (monotonic, plausible durations).

This keeps verification proportionate to MVP scope: a real integration test where it matters most (the ingestion pipeline), manual checks where automation would be premature investment (mobile E2E).

## Later phases
To be filled in as each phase is planned in detail (Phase 2: per-test-type ingestion checks; Phase 3: ML output correctness/regression checks against known synthetic inputs; Phase 4: LLM guardrail eval set against prohibited-language cases).
