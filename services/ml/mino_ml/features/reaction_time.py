"""Reaction Time feature computation. Each trial is a stimulusShown event
followed by the next touchDown event (see
apps/mobile/src/ReactionTimeScreen.tsx) — reaction time is the gap
between them.
"""

from __future__ import annotations

from typing import Any

from . import common

# A trial counts as a "lapse" (an unusually slow response) when its
# reaction time is more than this many times the session's own median —
# relative to that person's own data, never a fixed clinical threshold.
LAPSE_MULTIPLIER = 2.0


def compute(raw_events: list[dict[str, Any]]) -> dict[str, Any]:
    reaction_times: list[float] = []
    pending_stimulus_ms: float | None = None

    for event in raw_events:
        if event["eventType"] == "StimulusShown":
            pending_stimulus_ms = event["tMs"]
        elif event["eventType"] == "TouchDown" and pending_stimulus_ms is not None:
            reaction_times.append(event["tMs"] - pending_stimulus_ms)
            pending_stimulus_ms = None

    med = common.median(reaction_times)
    lapse_count = (
        sum(1 for rt in reaction_times if rt > med * LAPSE_MULTIPLIER) if med else 0
    )

    return {
        "trialCount": len(reaction_times),
        "reactionTimeMeanMs": common.mean(reaction_times),
        "reactionTimeMedianMs": med,
        "reactionTimeSdMs": common.stdev(reaction_times),
        "reactionTimeCv": common.coefficient_of_variation(reaction_times),
        "fastestReactionTimeMs": min(reaction_times) if reaction_times else None,
        "lapseCount": lapse_count,
    }
