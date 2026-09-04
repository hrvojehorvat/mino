"""One request per test type through the actual Flask endpoint, proving the
HTTP wiring (request parsing, dispatch, JSON response) works end-to-end —
the feature math itself is already covered by test_features_*.py.
"""

import pytest

from mino_ml.app import app


@pytest.fixture
def client():
    return app.test_client()


def test_health(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_compute_finger_tapping(client):
    response = client.post(
        "/compute",
        json={
            "testType": "FingerTapping",
            "rawEvents": [
                {"eventType": "TouchDown", "tMs": 100},
                {"eventType": "TouchUp", "tMs": 150},
                {"eventType": "TouchDown", "tMs": 300},
                {"eventType": "TouchUp", "tMs": 340},
            ],
        },
    )

    assert response.status_code == 200
    metrics = response.get_json()
    assert metrics["tapCount"] == 2
    assert metrics["interTapIntervalMeanMs"] == pytest.approx(200)


def test_compute_reaction_time(client):
    response = client.post(
        "/compute",
        json={
            "testType": "ReactionTime",
            "rawEvents": [
                {"eventType": "StimulusShown", "tMs": 1000},
                {"eventType": "TouchDown", "tMs": 1300},
            ],
        },
    )

    assert response.status_code == 200
    metrics = response.get_json()
    assert metrics["trialCount"] == 1
    assert metrics["reactionTimeMeanMs"] == pytest.approx(300)


def test_compute_target_tapping(client):
    response = client.post(
        "/compute",
        json={
            "testType": "TargetTapping",
            "rawEvents": [
                {"eventType": "TargetShown", "tMs": 1000, "x": 100, "y": 100},
                {"eventType": "TouchDown", "tMs": 1400, "x": 110, "y": 104},
            ],
        },
    )

    assert response.status_code == 200
    metrics = response.get_json()
    assert metrics["hitCount"] == 1
    assert metrics["tapDistanceMeanPx"] == pytest.approx(10.7703, rel=1e-3)


def test_compute_finger_tracing(client):
    response = client.post(
        "/compute",
        json={
            "testType": "FingerTracing",
            "rawEvents": [
                {"eventType": "TouchDown", "tMs": 0, "x": 0, "y": 0},
                {"eventType": "TouchMove", "tMs": 100, "x": 5, "y": 2},
                {"eventType": "TouchUp", "tMs": 200, "x": 10, "y": 0},
            ],
            "testParams": {"referencePath": [{"x": 0, "y": 0}, {"x": 10, "y": 0}]},
        },
    )

    assert response.status_code == 200
    metrics = response.get_json()
    assert metrics["pointCount"] == 3
    assert metrics["completionTimeMs"] == pytest.approx(200)
    assert metrics["pathDeviationMaxPx"] == pytest.approx(2.0)


def test_compute_phone_stability(client):
    response = client.post(
        "/compute",
        json={
            "testType": "PhoneStability",
            "rawEvents": [],
            "sensorSamples": [
                {"tMs": i * 20, "ax": 1.0, "ay": 0.0, "az": 0.0, "gx": 0.0, "gy": 0.0, "gz": 0.0}
                for i in range(20)
            ],
        },
    )

    assert response.status_code == 200
    metrics = response.get_json()
    assert metrics["accelRmsG"] == pytest.approx(0, abs=1e-9)


def test_compute_guided_movement(client):
    response = client.post(
        "/compute",
        json={
            "testType": "GuidedMovement",
            "rawEvents": [],
            "sensorSamples": [
                {"tMs": 0, "gx": 0.01, "gy": 0.01, "gz": 0.01},
                {"tMs": 2500, "gx": 0.01, "gy": 0.01, "gz": 0.01},
                {"tMs": 3000, "gx": 0.01, "gy": 0.0, "gz": 0.0},
                {"tMs": 3500, "gx": 0.6, "gy": 0.0, "gz": 0.0},
            ],
        },
    )

    assert response.status_code == 200
    metrics = response.get_json()
    assert metrics["promptCount"] == 1
    assert metrics["responseLatencyMeanMs"] == pytest.approx(500.0)
