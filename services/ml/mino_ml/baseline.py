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
        }

    return {"sampleSize": len(history), "metrics": metrics}
