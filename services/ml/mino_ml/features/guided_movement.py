"""Guided Movement feature computation. The on-screen prompt schedule
isn't stored per session (see apps/mobile/src/GuidedMovementScreen.tsx),
just the raw accelerometer/gyroscope stream, so the same fixed schedule
is duplicated here to know which time window belongs to which prompt.
"""

from __future__ import annotations

import math
from typing import Any

from . import common

PROMPT_DURATION_MS = 3000
# Mirrors apps/mobile/src/GuidedMovementScreen.tsx's PROMPTS list — only
# the directional ones are scored here, "level" is just a rest window.
PROMPTS = ["level", "left", "level", "right", "level", "forward", "level"]

# A prompt window counts as "responded to" once angular velocity rises
# above this many times the resting noise level measured in the session's
# own first ("hold level and still") window — relative to that person's
# own data, not a fixed absolute threshold.
RESPONSE_THRESHOLD_MULTIPLIER = 3.0

_AXES = ("gx", "gy", "gz")


def _window_samples(sensor_samples: list[dict[str, Any]], start_ms: float, end_ms: float):
    return [s for s in sensor_samples if start_ms <= s["tMs"] < end_ms]


def _gyro_magnitude(sample: dict[str, Any]) -> float:
    return math.sqrt(sample["gx"] ** 2 + sample["gy"] ** 2 + sample["gz"] ** 2)


def _dominant_axis(samples: list[dict[str, Any]]) -> tuple[str, float] | None:
    """The gyro axis with the largest mean absolute value in this window,
    and its signed mean — used only to compare "left" against "right"
    self-referentially, never against an absolute hardware convention.
    """
    if not samples:
        return None
    means = {axis: common.mean([s[axis] for s in samples]) for axis in _AXES}
    axis = max(means, key=lambda a: abs(means[a]))
    return axis, means[axis]


def compute(sensor_samples: list[dict[str, Any]] | None) -> dict[str, Any]:
    if not sensor_samples:
        return {
            "promptCount": 0,
            "responseLatencyMeanMs": None,
            "peakAngularVelocityMeanRadPerS": None,
            "leftRightDirectionFlipped": None,
        }

    baseline = _window_samples(sensor_samples, 0, PROMPT_DURATION_MS)
    baseline_rms = (
        math.sqrt(common.mean([_gyro_magnitude(s) ** 2 for s in baseline]))
        if baseline
        else 0.0
    )
    noise_threshold = baseline_rms * RESPONSE_THRESHOLD_MULTIPLIER

    latencies: list[float] = []
    peaks: list[float] = []
    dominant_by_prompt: dict[str, tuple[str, float]] = {}

    for index, prompt in enumerate(PROMPTS):
        if prompt == "level":
            continue
        start_ms = index * PROMPT_DURATION_MS
        end_ms = start_ms + PROMPT_DURATION_MS
        window = _window_samples(sensor_samples, start_ms, end_ms)
        if not window:
            continue

        magnitudes = [_gyro_magnitude(s) for s in window]
        peaks.append(max(magnitudes))

        first_response = next(
            (s for s, m in zip(window, magnitudes) if m > noise_threshold), None
        )
        if first_response is not None:
            latencies.append(first_response["tMs"] - start_ms)

        dominant = _dominant_axis(window)
        if dominant is not None:
            dominant_by_prompt[prompt] = dominant

    direction_flipped = None
    if "left" in dominant_by_prompt and "right" in dominant_by_prompt:
        left_axis, left_sign = dominant_by_prompt["left"]
        right_axis, right_sign = dominant_by_prompt["right"]
        if left_axis == right_axis:
            direction_flipped = (left_sign > 0) != (right_sign > 0)

    return {
        "promptCount": len(peaks),
        "responseLatencyMeanMs": common.mean(latencies),
        "peakAngularVelocityMeanRadPerS": common.mean(peaks),
        "leftRightDirectionFlipped": direction_flipped,
    }
