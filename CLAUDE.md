## PROJECT

Build an AI-powered HealthTech mobile app named Mino consisting of simple game-like neuromotor tests.

Users perform tests such as:

* Finger tapping — speed, timing, consistency and accuracy
* Reaction time
* Target tapping / coordination
* Finger tracing
* Phone stability using accelerometer + gyroscope
* Guided phone movement using motion sensors

The app collects **raw touch and sensor time-series data**, not just final scores.

The long-term goal is to use this data for ML models that detect patterns, anomalies and changes from a user's personal baseline.

### AI

**ML** analyzes the actual numerical/time-series data and produces structured results.

We want to experiment with ML models, time-series models, pretrained models and eventually fine-tuning.

**LLM** is a separate layer used to explain ML results in simple human language. It must not diagnose or invent medical conclusions.

This is an experimental/wellness product, **not a medical diagnostic tool**.

---

## HOW TO BUILD IT

### Stack

* React Native + TypeScript
* NestJS + TypeScript
* PostgreSQL + Prisma
* Kafka where asynchronous/event-driven processing is actually useful
* Azure
* Python for ML
* LLM integration

### Principles

**Think before coding**

* Don't assume unclear requirements.
* Surface important tradeoffs.
* Ask when genuinely blocked.

**Simplicity first**

* Build the minimum required.
* No speculative features or abstractions.
* Don't over-engineer.

**Data first**

* Preserve raw touch/sensor data whenever practical.
* Keep raw data separate from derived ML features.

**Separation**

* Mobile collects data.
* Backend manages application/data flow.
* ML analyzes data.
* LLM explains ML results.

Keep ML models replaceable and independent from the main application.

**Surgical changes**

* Change only what the task requires.
* Don't refactor unrelated code.

**Verify**

* Define what "done" means.
* Test important behavior.
* Run type checks/tests after changes.

When in doubt, prefer the **simplest solution that preserves future ML experimentation**.

## Development Process

Before implementing a significant feature:

1. Inspect the existing code.
2. Understand the current architecture.
3. Create a plan.
4. Explain important architectural decisions.
5. Wait for approval when the change is significant.
6. Implement incrementally.
7. Add/update tests.
8. Update documentation when architecture changes.

### Continuous Improvement

At the end of each development session:

1. Review what was implemented.
2. Review feedback, corrections, and problems discovered during the session.
3. Identify reusable lessons or architectural decisions.
4. Update relevant documentation in `docs/`.
5. Update `CLAUDE.md` only if a fundamental rule or architectural boundary has changed.
6. Do not add temporary details or session-specific information to `CLAUDE.md`.

The goal is to maintain a continuous feedback loop so the project documentation and development process improve over time.

Keep detailed architecture, decisions, lessons learned, and plans in `docs/`, not in this file.

Update this file only when a fundamental project rule or architectural boundary changes.

