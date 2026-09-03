"""Target Tapping feature computation. Each target is a targetShown event
(carrying the target's spawn position) followed by a touchDown event (see
apps/mobile/src/TargetTappingScreen.tsx) — accuracy is the distance
between them, movement time is the gap between them.

targetShown's x/y is the target's top-left spawn position, not its
center, so distances here are relative to that anchor point consistently
across all sessions — good for comparing a session against itself over
time, not meant as a pixel-exact "hit or miss" (that would also need the
target's on-screen size, which isn't part of the stored session data).
"""

from __future__ import annotations

import math
from typing import Any

from . import common


def compute(raw_events: list[dict[str, Any]]) -> dict[str, Any]:
    distances: list[float] = []
    movement_times: list[float] = []
    pending_target: dict[str, Any] | None = None

    for event in raw_events:
        if event["eventType"] == "TargetShown":
            pending_target = event
        elif event["eventType"] == "TouchDown" and pending_target is not None:
            dx = event["x"] - pending_target["x"]
            dy = event["y"] - pending_target["y"]
            distances.append(math.hypot(dx, dy))
            movement_times.append(event["tMs"] - pending_target["tMs"])
            pending_target = None

    return {
        "hitCount": len(distances),
        "tapDistanceMeanPx": common.mean(distances),
        "tapDistanceMedianPx": common.median(distances),
        "tapDistanceSdPx": common.stdev(distances),
        "movementTimeMeanMs": common.mean(movement_times),
        "movementTimeMedianMs": common.median(movement_times),
        "movementTimeSdMs": common.stdev(movement_times),
    }
