"""Small pure statistics helpers shared by the per-test-type feature
modules. No numpy here on purpose — these are simple enough to write by
hand; Step 3's frequency-domain sensor math is what actually needs it.
"""

from __future__ import annotations

import statistics


def mean(values: list[float]) -> float | None:
    return statistics.mean(values) if values else None


def median(values: list[float]) -> float | None:
    return statistics.median(values) if values else None


def stdev(values: list[float]) -> float | None:
    return statistics.stdev(values) if len(values) >= 2 else None


def coefficient_of_variation(values: list[float]) -> float | None:
    """Standard deviation relative to the mean — a unitless measure of
    consistency: 0 means perfectly steady, higher means more variable.
    """
    m = mean(values)
    s = stdev(values)
    if not m:
        return None
    return s / m if s is not None else None


def linear_slope(values: list[float]) -> float | None:
    """Least-squares slope of `values` against their own index (0, 1, 2, ...) —
    a simple "trend over the session" signal, e.g. whether inter-tap
    intervals grow over time (slowing down / fatigue).
    """
    n = len(values)
    if n < 2:
        return None
    xs = range(n)
    x_mean = (n - 1) / 2
    y_mean = sum(values) / n
    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, values))
    denominator = sum((x - x_mean) ** 2 for x in xs)
    return numerator / denominator if denominator else None
