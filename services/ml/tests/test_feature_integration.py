"""One end-to-end test per newly-covered test type: real RawEvent rows in
mino_test -> run_once -> a real (non-empty) MLResult row, proving the
pipeline reads and computes correctly, not just that compute() is right
in isolation.
"""

import pytest

from mino_ml.poller import run_once


def _metrics_for(conn, session_id):
    with conn.cursor() as cur:
        cur.execute('SELECT metrics FROM "MLResult" WHERE "sessionId" = %s', (session_id,))
        return cur.fetchone()["metrics"]


def test_finger_tapping_session_gets_real_metrics(conn, make_session, insert_events):
    session_id = make_session(test_type="FingerTapping")
    insert_events(
        session_id,
        [
            {"eventType": "TouchDown", "tMs": 100},
            {"eventType": "TouchUp", "tMs": 150},
            {"eventType": "TouchDown", "tMs": 300},
            {"eventType": "TouchUp", "tMs": 340},
        ],
    )

    run_once(conn)

    metrics = _metrics_for(conn, session_id)
    assert metrics["tapCount"] == 2
    assert metrics["interTapIntervalMeanMs"] == pytest.approx(200)


def test_reaction_time_session_gets_real_metrics(conn, make_session, insert_events):
    session_id = make_session(test_type="ReactionTime")
    insert_events(
        session_id,
        [
            {"eventType": "StimulusShown", "tMs": 1000},
            {"eventType": "TouchDown", "tMs": 1300},
        ],
    )

    run_once(conn)

    metrics = _metrics_for(conn, session_id)
    assert metrics["trialCount"] == 1
    assert metrics["reactionTimeMeanMs"] == pytest.approx(300)


def test_target_tapping_session_gets_real_metrics(conn, make_session, insert_events):
    session_id = make_session(test_type="TargetTapping")
    insert_events(
        session_id,
        [
            {"eventType": "TargetShown", "tMs": 1000, "x": 100, "y": 100},
            {"eventType": "TouchDown", "tMs": 1400, "x": 110, "y": 104},
        ],
    )

    run_once(conn)

    metrics = _metrics_for(conn, session_id)
    assert metrics["hitCount"] == 1
    assert metrics["tapDistanceMeanPx"] == pytest.approx(10.7703, rel=1e-3)


def test_finger_tracing_session_gets_real_metrics(conn, make_session, insert_events):
    session_id = make_session(
        test_type="FingerTracing",
        test_params={"referencePath": [{"x": 0, "y": 0}, {"x": 10, "y": 0}]},
    )
    insert_events(
        session_id,
        [
            {"eventType": "TouchDown", "tMs": 0, "x": 0, "y": 0},
            {"eventType": "TouchMove", "tMs": 100, "x": 5, "y": 2},
            {"eventType": "TouchUp", "tMs": 200, "x": 10, "y": 0},
        ],
    )

    run_once(conn)

    metrics = _metrics_for(conn, session_id)
    assert metrics["pointCount"] == 3
    assert metrics["completionTimeMs"] == pytest.approx(200)
    assert metrics["pathDeviationMaxPx"] == pytest.approx(2.0)


def test_phone_stability_session_gets_real_metrics(conn, make_session, insert_sensor_samples):
    session_id = make_session(test_type="PhoneStability")
    insert_sensor_samples(
        session_id,
        [
            {"tMs": i * 20, "ax": 1.0, "ay": 0.0, "az": 0.0, "gx": 0.0, "gy": 0.0, "gz": 0.0}
            for i in range(20)
        ],
    )

    run_once(conn)

    metrics = _metrics_for(conn, session_id)
    assert metrics["accelRmsG"] == pytest.approx(0, abs=1e-9)


def test_guided_movement_session_gets_real_metrics(conn, make_session, insert_sensor_samples):
    session_id = make_session(test_type="GuidedMovement")
    insert_sensor_samples(
        session_id,
        [
            {"tMs": 0, "gx": 0.01, "gy": 0.01, "gz": 0.01},
            {"tMs": 2500, "gx": 0.01, "gy": 0.01, "gz": 0.01},
            {"tMs": 3000, "gx": 0.01, "gy": 0.0, "gz": 0.0},
            {"tMs": 3500, "gx": 0.6, "gy": 0.0, "gz": 0.0},
        ],
    )

    run_once(conn)

    metrics = _metrics_for(conn, session_id)
    assert metrics["promptCount"] == 1
    assert metrics["responseLatencyMeanMs"] == pytest.approx(500.0)
