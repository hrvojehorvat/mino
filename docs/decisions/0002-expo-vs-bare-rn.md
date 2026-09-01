# 0002 — Expo (managed) vs bare React Native

**Status:** proposed

## Context
Touch event capture (MVP) and, later, accelerometer/gyroscope access (Phase 2) both need to work reliably without a lot of native-build overhead, especially for a solo dev getting to a working device build fast.

## Decision
Use Expo (managed workflow) for MVP. Expo's APIs cover touch capture and standard motion sensors well, and it significantly reduces native-build friction.

## Consequences
Revisit only if a Phase 2+ sensor requirement needs something Expo doesn't expose (uncommon for accelerometer/gyroscope, more likely for exotic native modules). Cross that bridge if reached rather than pre-solving it — Expo also supports ejecting/prebuild if needed later.
