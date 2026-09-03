import math

import pytest

from mino_ml.features import phone_stability


def test_perfectly_still_phone_has_near_zero_metrics():
    samples = [
        {"tMs": i * 20, "ax": 1.0, "ay": 0.0, "az": 0.0, "gx": 0.0, "gy": 0.0, "gz": 0.0}
        for i in range(20)
    ]

    result = phone_stability.compute(samples)

    # Constant readings -> zero after mean-subtraction -> zero movement.
    assert result["accelRmsG"] == pytest.approx(0, abs=1e-9)
    assert result["gyroRmsRadPerS"] == pytest.approx(0, abs=1e-9)
    assert result["dominantPower"] == pytest.approx(0, abs=1e-9)


def test_detects_a_known_oscillation_frequency():
    fs_hz = 50.0
    true_freq_hz = 2.0
    n = 100  # 2 seconds at 50Hz -> 0.5Hz frequency resolution, 2Hz lands on a bin
    samples = [
        {
            "tMs": i * (1000 / fs_hz),
            "ax": 1.0 + 0.1 * math.sin(2 * math.pi * true_freq_hz * (i / fs_hz)),
            "ay": 0.0,
            "az": 0.0,
            "gx": 0.0,
            "gy": 0.0,
            "gz": 0.0,
        }
        for i in range(n)
    ]

    result = phone_stability.compute(samples)

    assert result["dominantFrequencyHz"] == pytest.approx(true_freq_hz, abs=0.5)
    assert result["dominantPower"] > 0
    assert result["accelRmsG"] > 0


def test_handles_no_samples():
    result = phone_stability.compute(None)

    assert result["accelRmsG"] is None
    assert result["dominantFrequencyHz"] is None
