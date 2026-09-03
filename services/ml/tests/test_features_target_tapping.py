import pytest

from mino_ml.features import target_tapping


def _target(x, y, shown_ms, tap_x, tap_y, tap_ms):
    return [
        {"eventType": "TargetShown", "tMs": shown_ms, "x": x, "y": y},
        {"eventType": "TouchDown", "tMs": tap_ms, "x": tap_x, "y": tap_y},
    ]


def test_computes_expected_metrics():
    events = _target(100, 100, 1000, 110, 104, 1400) + _target(
        300, 300, 2000, 280, 310, 2350
    )

    result = target_tapping.compute(events)

    assert result["hitCount"] == 2
    assert result["tapDistanceMeanPx"] == pytest.approx(16.5655, rel=1e-3)
    assert result["tapDistanceMedianPx"] == pytest.approx(16.5655, rel=1e-3)
    assert result["tapDistanceSdPx"] == pytest.approx(8.195, rel=1e-3)
    assert result["movementTimeMeanMs"] == pytest.approx(375)
    assert result["movementTimeMedianMs"] == pytest.approx(375)
    assert result["movementTimeSdMs"] == pytest.approx(35.355, rel=1e-3)


def test_handles_no_hits():
    result = target_tapping.compute([{"eventType": "TargetShown", "tMs": 0, "x": 0, "y": 0}])

    assert result["hitCount"] == 0
    assert result["tapDistanceMeanPx"] is None
