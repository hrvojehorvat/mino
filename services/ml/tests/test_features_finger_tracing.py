import pytest

from mino_ml.features import finger_tracing

STRAIGHT_PATH = {"referencePath": [{"x": 0, "y": 0}, {"x": 10, "y": 0}, {"x": 20, "y": 0}]}


def test_path_deviation_and_completion_time():
    events = [
        {"eventType": "TouchDown", "tMs": 0, "x": 0, "y": 1},
        {"eventType": "TouchMove", "tMs": 100, "x": 5, "y": 2},
        {"eventType": "TouchMove", "tMs": 200, "x": 10, "y": 1},
        {"eventType": "TouchMove", "tMs": 300, "x": 15, "y": 0},
        {"eventType": "TouchUp", "tMs": 400, "x": 20, "y": 1},
    ]

    result = finger_tracing.compute(events, STRAIGHT_PATH)

    assert result["pointCount"] == 5
    # distances to the straight line y=0: 1, 2, 1, 0, 1
    assert result["pathDeviationMeanPx"] == pytest.approx(1.0)
    assert result["pathDeviationMaxPx"] == pytest.approx(2.0)
    assert result["completionTimeMs"] == pytest.approx(400)


def test_mean_jerk_on_cubic_motion():
    # x = t^3 (t in seconds) has a constant, nonzero third derivative —
    # discrete differencing of x=[0,1,8,27,64] at t=[0,1,2,3,4]s gives an
    # exact jerk magnitude of 6 px/s^3 at every step.
    events = [
        {"eventType": "TouchDown", "tMs": 0, "x": 0, "y": 0},
        {"eventType": "TouchMove", "tMs": 1000, "x": 1, "y": 0},
        {"eventType": "TouchMove", "tMs": 2000, "x": 8, "y": 0},
        {"eventType": "TouchMove", "tMs": 3000, "x": 27, "y": 0},
        {"eventType": "TouchUp", "tMs": 4000, "x": 64, "y": 0},
    ]

    result = finger_tracing.compute(events, None)

    assert result["meanJerkPxPerS3"] == pytest.approx(6.0)


def test_handles_no_reference_path():
    events = [{"eventType": "TouchDown", "tMs": 0, "x": 0, "y": 0}]

    result = finger_tracing.compute(events, None)

    assert result["pathDeviationMeanPx"] is None
    assert result["pointCount"] == 1
