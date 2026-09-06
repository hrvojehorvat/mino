"""Per-user, per-metric baseline comparison: given a user's past metrics for
a test type and their current session's metrics, flag which ones deviate
from that user's own history. Pure function, no I/O — apps/api loads the
history/current metrics via Prisma and persists the result (see
docs/decisions/0006-ml-trigger-mechanism.md for why the same shape is used
here as for /compute).

This is deliberately the simplest thing that could work: z-score against the
user's own mean/stdev. It is not a trained model and makes no claim about
what a deviation *means* — see CLAUDE.md's Phase 5 scope note. Comparison
against a population norm/clinical threshold is explicitly deferred (see
docs/roadmap.md).
"""

from __future__ import annotations

from .features import common

# Below this many prior sessions, a mean/stdev isn't meaningful yet — return
# an empty result rather than a guess from too few points.
MIN_HISTORY_SIZE = 3

# |z| beyond this is flagged. Picked as a conventional default, not tuned
# against real data yet.
DEFAULT_Z_THRESHOLD = 2.0

# A z-score anomaly says a metric deviated a lot from this person's own
# history — it says nothing about whether that deviation is good or bad
# news (much faster is just as "anomalous" as much slower). Whether lower
# or higher is the favorable direction is a fact about the metric itself,
# not something an LLM prompt should be left to guess: this table makes it
# deterministic, the same reason guardrail.py checks the model's output
# instead of trusting a prompt instruction. Any metric not listed here (or
# listed as None) has no established direction — favorable stays None
# rather than defaulting to a guess, so a newly-added metric fails safe.
METRIC_DIRECTION: dict[str, str | None] = {
    # fingerTapping
    "tapCount": "higher_is_better",
    "interTapIntervalMeanMs": "lower_is_better",
    "interTapIntervalMedianMs": "lower_is_better",
    "interTapIntervalSdMs": "lower_is_better",
    "interTapIntervalCv": "lower_is_better",
    "tapDurationMeanMs": None,
    "tapRateHz": "higher_is_better",
    "fatigueSlopeMsPerTap": "lower_is_better",
    # reactionTime
    "trialCount": None,
    "reactionTimeMeanMs": "lower_is_better",
    "reactionTimeMedianMs": "lower_is_better",
    "reactionTimeSdMs": "lower_is_better",
    "reactionTimeCv": "lower_is_better",
    "fastestReactionTimeMs": "lower_is_better",
    "lapseCount": "lower_is_better",
    # targetTapping
    "hitCount": None,
    "tapDistanceMeanPx": "lower_is_better",
    "tapDistanceMedianPx": "lower_is_better",
    "tapDistanceSdPx": "lower_is_better",
    "movementTimeMeanMs": "lower_is_better",
    "movementTimeMedianMs": "lower_is_better",
    "movementTimeSdMs": "lower_is_better",
    # fingerTracing
    "pointCount": None,
    "pathDeviationMeanPx": "lower_is_better",
    "pathDeviationMaxPx": "lower_is_better",
    "completionTimeMs": "lower_is_better",
    "meanJerkPxPerS3": "lower_is_better",
    # phoneStability
    "accelRmsG": "lower_is_better",
    "gyroRmsRadPerS": "lower_is_better",
    "dominantFrequencyHz": None,
    "dominantPower": None,
    # guidedMovement
    "promptCount": None,
    "responseLatencyMeanMs": "lower_is_better",
    "peakAngularVelocityMeanRadPerS": None,
}


def _favorable(z_score: float, direction: str | None) -> bool | None:
    if direction is None:
        return None
    if direction == "lower_is_better":
        return z_score < 0
    return z_score > 0


def compute_baseline(
    history: list[dict[str, float]],
    current: dict[str, float],
    z_threshold: float = DEFAULT_Z_THRESHOLD,
) -> dict:
    if len(history) < MIN_HISTORY_SIZE:
        return {"sampleSize": len(history), "metrics": {}}

    metrics: dict[str, dict] = {}
    for key, value in current.items():
        if not isinstance(value, (int, float)):
            continue
        past_values = [
            h[key] for h in history if isinstance(h.get(key), (int, float))
        ]
        if len(past_values) < MIN_HISTORY_SIZE:
            continue

        baseline_mean = common.mean(past_values)
        baseline_sd = common.stdev(past_values)
        z_score = (
            0.0
            if not baseline_sd
            else (value - baseline_mean) / baseline_sd
        )

        metrics[key] = {
            "value": value,
            "baselineMean": baseline_mean,
            "baselineSd": baseline_sd,
            "zScore": z_score,
            "isAnomalous": abs(z_score) > z_threshold,
            "favorable": _favorable(z_score, METRIC_DIRECTION.get(key)),
        }

    return {"sampleSize": len(history), "metrics": metrics}
