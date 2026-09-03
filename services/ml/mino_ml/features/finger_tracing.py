"""Finger Tracing feature computation. Raw events are a TouchDown, a
stream of TouchMove samples, and a TouchUp (see
apps/mobile/src/FingerTracingScreen.tsx) — the traced points, in order,
against the session's own reference path (stored on TestSession.testParams).
"""

from __future__ import annotations

import math
from typing import Any

from . import common

# Below this many traced points there isn't enough of a curve to compute a
# meaningful jerk (smoothness) value — position -> velocity -> acceleration
# -> jerk each drop one point via differencing.
MIN_POINTS_FOR_JERK = 4


def _closest_distance_to_path(
    point: tuple[float, float], path: list[tuple[float, float]]
) -> float:
    px, py = point
    best = math.inf
    for (ax, ay), (bx, by) in zip(path, path[1:]):
        abx, aby = bx - ax, by - ay
        length_sq = abx * abx + aby * aby
        if length_sq == 0:
            t = 0.0
        else:
            t = max(0.0, min(1.0, ((px - ax) * abx + (py - ay) * aby) / length_sq))
        closest_x, closest_y = ax + t * abx, ay + t * aby
        best = min(best, math.hypot(px - closest_x, py - closest_y))
    return best


def _mean_jerk(points: list[tuple[float, float, float]]) -> float | None:
    """points: (t_seconds, x, y), in order. Returns the mean magnitude of
    jerk (rate of change of acceleration) — higher means a less smooth,
    more erratic trace.
    """
    if len(points) < MIN_POINTS_FOR_JERK:
        return None

    velocities = []
    for (t1, x1, y1), (t2, x2, y2) in zip(points, points[1:]):
        dt = t2 - t1
        if dt <= 0:
            continue
        velocities.append(((t1 + t2) / 2, (x2 - x1) / dt, (y2 - y1) / dt))

    accelerations = []
    for (t1, vx1, vy1), (t2, vx2, vy2) in zip(velocities, velocities[1:]):
        dt = t2 - t1
        if dt <= 0:
            continue
        accelerations.append(((t1 + t2) / 2, (vx2 - vx1) / dt, (vy2 - vy1) / dt))

    jerk_magnitudes = []
    for (t1, ax1, ay1), (t2, ax2, ay2) in zip(accelerations, accelerations[1:]):
        dt = t2 - t1
        if dt <= 0:
            continue
        jx, jy = (ax2 - ax1) / dt, (ay2 - ay1) / dt
        jerk_magnitudes.append(math.hypot(jx, jy))

    return common.mean(jerk_magnitudes)


def compute(raw_events: list[dict[str, Any]], test_params: dict[str, Any] | None) -> dict[str, Any]:
    reference_path = (test_params or {}).get("referencePath") or []
    path_points = [(p["x"], p["y"]) for p in reference_path]

    traced = [
        (e["tMs"] / 1000, e["x"], e["y"])
        for e in raw_events
        if e["eventType"] in ("TouchDown", "TouchMove", "TouchUp") and e["x"] is not None
    ]

    deviations = (
        [_closest_distance_to_path((x, y), path_points) for _, x, y in traced]
        if len(path_points) >= 2
        else []
    )

    down_ms = next((e["tMs"] for e in raw_events if e["eventType"] == "TouchDown"), None)
    up_ms = next(
        (e["tMs"] for e in reversed(raw_events) if e["eventType"] == "TouchUp"), None
    )
    completion_time_ms = up_ms - down_ms if down_ms is not None and up_ms is not None else None

    return {
        "pointCount": len(traced),
        "pathDeviationMeanPx": common.mean(deviations),
        "pathDeviationMaxPx": max(deviations) if deviations else None,
        "completionTimeMs": completion_time_ms,
        "meanJerkPxPerS3": _mean_jerk(traced),
    }
