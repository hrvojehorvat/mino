"""Dispatches a session's raw data to the right feature-computation module
by testType. Each module exposes a pure compute(...) function of that
session's own raw data only — the specific inputs it needs differ by test
type (discrete events, a reference path, or a continuous sensor stream),
so this just calls the right one directly rather than forcing one shared
signature.
"""

from __future__ import annotations

from typing import Any

from . import (
    finger_tapping,
    finger_tracing,
    guided_movement,
    phone_stability,
    reaction_time,
    target_tapping,
)


def compute_metrics(
    test_type: str,  # Postgres enum casing, e.g. "FingerTapping" — this
    # reads straight from Postgres (see db.find_unprocessed_sessions), not
    # through the API, so it's in the DB's own PascalCase, not the
    # camelCase wire format shared-types/DTOs use.
    raw_events: list[dict[str, Any]],
    sensor_samples: list[dict[str, Any]] | None,
    test_params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if test_type == "FingerTapping":
        return finger_tapping.compute(raw_events)
    if test_type == "ReactionTime":
        return reaction_time.compute(raw_events)
    if test_type == "TargetTapping":
        return target_tapping.compute(raw_events)
    if test_type == "FingerTracing":
        return finger_tracing.compute(raw_events, test_params)
    if test_type == "PhoneStability":
        return phone_stability.compute(sensor_samples)
    if test_type == "GuidedMovement":
        return guided_movement.compute(sensor_samples)
    return {}
