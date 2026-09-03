import pytest

from mino_ml.features import reaction_time


def _trial(stimulus_ms, tap_ms):
    return [
        {"eventType": "StimulusShown", "tMs": stimulus_ms},
        {"eventType": "TouchDown", "tMs": tap_ms},
    ]


def test_computes_expected_metrics_and_flags_a_lapse():
    # RTs: 300, 250, 900 — median 300, so 900 (> 2x median) is a lapse.
    events = _trial(1000, 1300) + _trial(3000, 3250) + _trial(5000, 5900)

    result = reaction_time.compute(events)

    assert result["trialCount"] == 3
    assert result["reactionTimeMeanMs"] == pytest.approx(483.333, rel=1e-3)
    assert result["reactionTimeMedianMs"] == pytest.approx(300)
    assert result["reactionTimeSdMs"] == pytest.approx(361.73, rel=1e-3)
    assert result["reactionTimeCv"] == pytest.approx(0.7484, rel=1e-3)
    assert result["fastestReactionTimeMs"] == pytest.approx(250)
    assert result["lapseCount"] == 1


def test_ignores_a_stimulus_with_no_following_tap():
    events = _trial(1000, 1300) + [{"eventType": "StimulusShown", "tMs": 3000}]

    result = reaction_time.compute(events)

    assert result["trialCount"] == 1


def test_handles_no_trials():
    result = reaction_time.compute([])

    assert result["trialCount"] == 0
    assert result["reactionTimeMeanMs"] is None
    assert result["lapseCount"] == 0
