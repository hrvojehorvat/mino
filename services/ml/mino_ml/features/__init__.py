"""Dispatches a session's raw data to the right feature-computation module
by testType. Each module exposes compute(...) -> dict[str, float], a pure
function of that session's own raw data only.

Phase 3.1: every test type computes an empty placeholder result, proving
the find -> read -> write pipeline end to end before any real math is
added in 3.2/3.3.
"""

from __future__ import annotations

from typing import Any


def compute_metrics(
    test_type: str,  # Postgres enum casing, e.g. "FingerTapping" — this
    # reads straight from Postgres (see db.find_unprocessed_sessions), not
    # through the API, so it's in the DB's own PascalCase, not the
    # camelCase wire format shared-types/DTOs use.
    raw_events: list[dict[str, Any]],
    sensor_samples: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    return {}
