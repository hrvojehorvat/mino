"""Finger Tapping feature computation. Raw events are touchDown/touchUp
pairs, one pair per tap (see apps/mobile/src/TappingScreen.tsx).
"""

from __future__ import annotations

from typing import Any

from . import common


def compute(raw_events: list[dict[str, Any]]) -> dict[str, Any]:
    downs = [e["tMs"] for e in raw_events if e["eventType"] == "TouchDown"]

    # Real captures sometimes have a TouchDown with no matching TouchUp
    # before the next TouchDown (e.g. a dropped event) — pair them up in
    # event order rather than by position, so one missing event doesn't
    # misalign every duration after it.
    durations: list[float] = []
    pending_down_ms: float | None = None
    for event in raw_events:
        if event["eventType"] == "TouchDown":
            pending_down_ms = event["tMs"]
        elif event["eventType"] == "TouchUp" and pending_down_ms is not None:
            durations.append(event["tMs"] - pending_down_ms)
            pending_down_ms = None

    tap_count = len(downs)
    inter_tap_intervals = [b - a for a, b in zip(downs, downs[1:])]

    elapsed_ms = downs[-1] - downs[0] if tap_count >= 2 else 0
    tap_rate_hz = tap_count / (elapsed_ms / 1000) if elapsed_ms > 0 else None

    return {
        "tapCount": tap_count,
        "interTapIntervalMeanMs": common.mean(inter_tap_intervals),
        "interTapIntervalMedianMs": common.median(inter_tap_intervals),
        "interTapIntervalSdMs": common.stdev(inter_tap_intervals),
        "interTapIntervalCv": common.coefficient_of_variation(inter_tap_intervals),
        "tapDurationMeanMs": common.mean(durations),
        "tapRateHz": tap_rate_hz,
        # Positive = gaps between taps grew over the session (slowing down).
        "fatigueSlopeMsPerTap": common.linear_slope(inter_tap_intervals),
    }
