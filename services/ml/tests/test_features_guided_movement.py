import pytest

from mino_ml.features import guided_movement

# Baseline "hold still" window (prompt 0, t=0..3000ms): tiny constant noise
# on all three axes -> rms = sqrt(3 * 0.01^2) ~= 0.01732,
# noise_threshold = rms * 3 ~= 0.05196.
BASELINE = [
    {"tMs": t, "gx": 0.01, "gy": 0.01, "gz": 0.01}
    for t in (0, 500, 1000, 1500, 2000, 2500)
]

# "left" prompt (index 1, window 3000..6000ms): first sample is still just
# noise, second sample is a clear response on gx, latency = 3500-3000 = 500ms.
LEFT = [
    {"tMs": 3000, "gx": 0.01, "gy": 0.0, "gz": 0.0},
    {"tMs": 3500, "gx": 0.6, "gy": 0.0, "gz": 0.0},
]

# "right" prompt (index 3, window 9000..12000ms): response on gx again but
# opposite sign, latency = 9600-9000 = 600ms.
RIGHT = [
    {"tMs": 9000, "gx": -0.01, "gy": 0.0, "gz": 0.0},
    {"tMs": 9600, "gx": -0.7, "gy": 0.0, "gz": 0.0},
]

# "forward" prompt (index 5, window 15000..18000ms): response on gz,
# latency = 15400-15000 = 400ms.
FORWARD = [
    {"tMs": 15000, "gx": 0.0, "gy": 0.0, "gz": 0.01},
    {"tMs": 15400, "gx": 0.0, "gy": 0.0, "gz": 0.45},
]


def test_latency_peak_and_direction_flip():
    samples = BASELINE + LEFT + RIGHT + FORWARD

    result = guided_movement.compute(samples)

    assert result["promptCount"] == 3
    # latencies: left=500, right=600, forward=400
    assert result["responseLatencyMeanMs"] == pytest.approx(500.0)
    # peaks: left=0.6, right=0.7, forward=0.45
    assert result["peakAngularVelocityMeanRadPerS"] == pytest.approx(
        (0.6 + 0.7 + 0.45) / 3
    )
    # left's dominant axis (gx) was positive, right's was negative -> flipped
    assert result["leftRightDirectionFlipped"] is True


def test_handles_no_samples():
    result = guided_movement.compute(None)

    assert result["promptCount"] == 0
    assert result["responseLatencyMeanMs"] is None
    assert result["leftRightDirectionFlipped"] is None


def test_forward_prompt_alone_has_no_direction_verdict():
    samples = BASELINE + FORWARD

    result = guided_movement.compute(samples)

    assert result["promptCount"] == 1
    assert result["leftRightDirectionFlipped"] is None
