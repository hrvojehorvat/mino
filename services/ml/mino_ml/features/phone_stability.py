"""Phone Stability feature computation. Input is one session's continuous
accelerometer (g) + gyroscope (rad/s) stream — see
apps/mobile/src/useMotionSensors.ts. The phone was meant to stay still, so
any acceleration/rotation captured is unwanted movement.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from scipy.signal import periodogram

# Below this many samples there isn't enough of a window for a meaningful
# frequency estimate.
MIN_SAMPLES_FOR_SPECTRUM = 16


def compute(sensor_samples: list[dict[str, Any]] | None) -> dict[str, Any]:
    if not sensor_samples:
        return {
            "accelRmsG": None,
            "gyroRmsRadPerS": None,
            "dominantFrequencyHz": None,
            "dominantPower": None,
        }

    ax = np.array([s["ax"] for s in sensor_samples])
    ay = np.array([s["ay"] for s in sensor_samples])
    az = np.array([s["az"] for s in sensor_samples])
    gx = np.array([s["gx"] for s in sensor_samples])
    gy = np.array([s["gy"] for s in sensor_samples])
    gz = np.array([s["gz"] for s in sensor_samples])

    # Subtract each axis's own mean to remove gravity (and any constant
    # sensor bias) — valid because the phone is meant to stay roughly level
    # and still for the whole session, so the mean approximates gravity.
    accel_mag = np.sqrt((ax - ax.mean()) ** 2 + (ay - ay.mean()) ** 2 + (az - az.mean()) ** 2)
    gyro_mag = np.sqrt(gx**2 + gy**2 + gz**2)

    accel_rms_g = float(np.sqrt(np.mean(accel_mag**2)))
    gyro_rms = float(np.sqrt(np.mean(gyro_mag**2)))

    dominant_freq_hz = None
    dominant_power = None
    if len(sensor_samples) >= MIN_SAMPLES_FOR_SPECTRUM:
        t_seconds = np.array([s["tMs"] for s in sensor_samples]) / 1000
        duration_s = t_seconds[-1] - t_seconds[0]
        if duration_s > 0:
            sample_rate_hz = (len(t_seconds) - 1) / duration_s
            # Sum each axis's own power spectrum rather than taking the
            # periodogram of the combined magnitude: magnitude rectifies a
            # single-axis oscillation (sqrt of a squared sine wave), which
            # doubles its apparent frequency. Summing power spectra has no
            # such artifact, since power (unlike magnitude) adds linearly
            # across axes.
            freqs, power_ax = periodogram(ax - ax.mean(), sample_rate_hz)
            _, power_ay = periodogram(ay - ay.mean(), sample_rate_hz)
            _, power_az = periodogram(az - az.mean(), sample_rate_hz)
            power = power_ax + power_ay + power_az
            # Skip the 0 Hz bin — the mean was already removed, so it holds
            # no information about actual shaking.
            above_zero = freqs > 0
            if above_zero.any():
                idx = int(np.argmax(power[above_zero]))
                dominant_freq_hz = float(freqs[above_zero][idx])
                dominant_power = float(power[above_zero][idx])

    return {
        "accelRmsG": accel_rms_g,
        "gyroRmsRadPerS": gyro_rms,
        "dominantFrequencyHz": dominant_freq_hz,
        "dominantPower": dominant_power,
    }
