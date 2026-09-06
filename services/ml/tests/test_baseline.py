import pytest

from mino_ml.baseline import compute_baseline


def test_computes_expected_zscore_against_history():
    history = [{"tapRateHz": 5.0}, {"tapRateHz": 6.0}, {"tapRateHz": 7.0}]
    current = {"tapRateHz": 9.0}

    result = compute_baseline(history, current)

    assert result["sampleSize"] == 3
    metric = result["metrics"]["tapRateHz"]
    assert metric["value"] == 9.0
    assert metric["baselineMean"] == pytest.approx(6.0)
    assert metric["baselineSd"] == pytest.approx(1.0)
    assert metric["zScore"] == pytest.approx(3.0)
    assert metric["isAnomalous"] is True


def test_within_normal_range_is_not_anomalous():
    history = [{"tapRateHz": 5.0}, {"tapRateHz": 6.0}, {"tapRateHz": 7.0}]
    current = {"tapRateHz": 6.5}

    result = compute_baseline(history, current)

    metric = result["metrics"]["tapRateHz"]
    assert metric["zScore"] == pytest.approx(0.5)
    assert metric["isAnomalous"] is False


def test_insufficient_history_returns_no_metrics():
    history = [{"tapRateHz": 5.0}, {"tapRateHz": 6.0}]
    current = {"tapRateHz": 9.0}

    result = compute_baseline(history, current)

    assert result == {"sampleSize": 2, "metrics": {}}


def test_zero_variance_history_does_not_divide_by_zero():
    history = [{"tapRateHz": 5.0}, {"tapRateHz": 5.0}, {"tapRateHz": 5.0}]
    current = {"tapRateHz": 5.0}

    result = compute_baseline(history, current)

    metric = result["metrics"]["tapRateHz"]
    assert metric["baselineSd"] == 0.0
    assert metric["zScore"] == 0.0
    assert metric["isAnomalous"] is False


def test_metric_missing_from_enough_history_entries_is_skipped():
    history = [
        {"tapRateHz": 5.0, "tapCount": 10},
        {"tapRateHz": 6.0},
        {"tapRateHz": 7.0},
    ]
    current = {"tapRateHz": 6.0, "tapCount": 12}

    result = compute_baseline(history, current)

    assert "tapRateHz" in result["metrics"]
    assert "tapCount" not in result["metrics"]


def test_non_numeric_current_values_are_ignored():
    history = [{"tapRateHz": 5.0}, {"tapRateHz": 6.0}, {"tapRateHz": 7.0}]
    current = {"tapRateHz": 6.0, "note": "not a number"}

    result = compute_baseline(history, current)

    assert "note" not in result["metrics"]


def test_higher_is_better_metric_above_baseline_is_favorable():
    # tapRateHz: higher is better — well above personal history is good news.
    history = [{"tapRateHz": 5.0}, {"tapRateHz": 6.0}, {"tapRateHz": 7.0}]
    current = {"tapRateHz": 9.0}

    result = compute_baseline(history, current)

    metric = result["metrics"]["tapRateHz"]
    assert metric["isAnomalous"] is True
    assert metric["favorable"] is True


def test_higher_is_better_metric_below_baseline_is_unfavorable():
    history = [{"tapRateHz": 5.0}, {"tapRateHz": 6.0}, {"tapRateHz": 7.0}]
    current = {"tapRateHz": 3.0}

    result = compute_baseline(history, current)

    metric = result["metrics"]["tapRateHz"]
    assert metric["isAnomalous"] is True
    assert metric["favorable"] is False


def test_lower_is_better_metric_below_baseline_is_favorable():
    # reactionTimeMeanMs: lower is better — a much faster reaction time is
    # a "great" anomaly, not a cautious one. This is the exact case the
    # user flagged: "if results are good or better than average, it is not
    # Anomalous it is great."
    history = [
        {"reactionTimeMeanMs": 300.0},
        {"reactionTimeMeanMs": 310.0},
        {"reactionTimeMeanMs": 290.0},
    ]
    current = {"reactionTimeMeanMs": 150.0}

    result = compute_baseline(history, current)

    metric = result["metrics"]["reactionTimeMeanMs"]
    assert metric["isAnomalous"] is True
    assert metric["favorable"] is True


def test_lower_is_better_metric_above_baseline_is_unfavorable():
    history = [
        {"reactionTimeMeanMs": 300.0},
        {"reactionTimeMeanMs": 310.0},
        {"reactionTimeMeanMs": 290.0},
    ]
    current = {"reactionTimeMeanMs": 500.0}

    result = compute_baseline(history, current)

    metric = result["metrics"]["reactionTimeMeanMs"]
    assert metric["isAnomalous"] is True
    assert metric["favorable"] is False


def test_metric_with_no_established_direction_stays_favorable_none():
    # dominantFrequencyHz has no known good/bad direction — even when
    # flagged anomalous, favorable must stay None rather than guessing.
    history = [
        {"dominantFrequencyHz": 4.0},
        {"dominantFrequencyHz": 4.2},
        {"dominantFrequencyHz": 3.9},
    ]
    current = {"dominantFrequencyHz": 9.0}

    result = compute_baseline(history, current)

    metric = result["metrics"]["dominantFrequencyHz"]
    assert metric["isAnomalous"] is True
    assert metric["favorable"] is None
