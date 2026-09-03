import pytest

from mino_ml.features import finger_tapping


def _tap(down_ms, up_ms):
    return [
        {"eventType": "TouchDown", "tMs": down_ms},
        {"eventType": "TouchUp", "tMs": up_ms},
    ]


def test_computes_expected_metrics_on_synthetic_taps():
    # 4 taps: gaps between them are 200, 200, 250ms — a widening last gap.
    events = (
        _tap(100, 150) + _tap(300, 340) + _tap(500, 545) + _tap(750, 800)
    )

    result = finger_tapping.compute(events)

    assert result["tapCount"] == 4
    assert result["interTapIntervalMeanMs"] == pytest.approx(216.667, rel=1e-3)
    assert result["interTapIntervalMedianMs"] == pytest.approx(200)
    assert result["interTapIntervalSdMs"] == pytest.approx(28.87, rel=1e-3)
    assert result["interTapIntervalCv"] == pytest.approx(0.1332, rel=1e-3)
    assert result["tapDurationMeanMs"] == pytest.approx(46.25)
    assert result["tapRateHz"] == pytest.approx(6.1538, rel=1e-3)
    # Gaps grew over the session (200 -> 200 -> 250), so the slope is positive.
    assert result["fatigueSlopeMsPerTap"] == pytest.approx(25)


def test_handles_a_single_tap():
    events = _tap(100, 150)

    result = finger_tapping.compute(events)

    assert result["tapCount"] == 1
    assert result["interTapIntervalMeanMs"] is None
    assert result["tapRateHz"] is None
    assert result["tapDurationMeanMs"] == pytest.approx(50)


def test_a_touch_down_with_no_matching_touch_up_does_not_corrupt_later_durations():
    # Real captures sometimes drop a TouchUp (seq 2 below never gets one
    # before the next TouchDown) — durations must stay paired by event
    # order, not by list position, or every duration after the gap would
    # be wrong.
    events = [
        {"eventType": "TouchDown", "tMs": 100},
        {"eventType": "TouchUp", "tMs": 150},  # tap 1 duration: 50
        {"eventType": "TouchDown", "tMs": 300},  # no TouchUp follows
        {"eventType": "TouchDown", "tMs": 500},
        {"eventType": "TouchUp", "tMs": 540},  # tap 3 duration: 40
    ]

    result = finger_tapping.compute(events)

    assert result["tapCount"] == 3
    assert result["tapDurationMeanMs"] == pytest.approx(45)


def test_handles_no_taps():
    result = finger_tapping.compute([])

    assert result["tapCount"] == 0
    assert result["tapDurationMeanMs"] is None
    assert result["tapRateHz"] is None
