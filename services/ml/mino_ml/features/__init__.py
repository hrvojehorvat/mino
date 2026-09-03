"""Dispatches a session's raw data to the right feature-computation module
by testType. Each module exposes compute(...) -> dict[str, float], a pure
function of that session's own raw data only.

Finger Tracing, Phone Stability and Guided Movement still return an empty
placeholder result — their feature modules land in Step 3.
"""

from __future__ import annotations

from typing import Any

from . import finger_tapping, reaction_time, target_tapping

_EVENT_HANDLERS = {
    "FingerTapping": finger_tapping.compute,
    "ReactionTime": reaction_time.compute,
    "TargetTapping": target_tapping.compute,
}


def compute_metrics(
    test_type: str,  # Postgres enum casing, e.g. "FingerTapping" — this
    # reads straight from Postgres (see db.find_unprocessed_sessions), not
    # through the API, so it's in the DB's own PascalCase, not the
    # camelCase wire format shared-types/DTOs use.
    raw_events: list[dict[str, Any]],
    sensor_samples: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    handler = _EVENT_HANDLERS.get(test_type)
    return handler(raw_events) if handler else {}
