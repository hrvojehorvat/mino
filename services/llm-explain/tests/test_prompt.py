"""Pure tests for prompt building — no model call, runs fast in normal CI.
Covers the personal-baseline rendering and the good/bad framing rules the
system prompt depends on (see docs/decisions/0007-llm-hosting-and-guardrail.md).
"""

from mino_llm.prompt import SYSTEM_PROMPT, build_prompt


def _session(baseline=None):
    return {
        "testType": "ReactionTime",
        "metrics": {"reactionTimeMeanMs": 150.0},
        "baseline": baseline,
    }


def test_no_baseline_renders_gracefully():
    prompt = build_prompt([_session(baseline=None)])

    assert "no personal baseline yet" in prompt


def test_empty_baseline_metrics_renders_gracefully():
    prompt = build_prompt([_session(baseline={})])

    assert "no metrics with enough history yet" in prompt


def test_favorable_anomaly_is_rendered_with_favorable_true():
    baseline = {
        "reactionTimeMeanMs": {
            "value": 150.0,
            "baselineMean": 300.0,
            "zScore": -3.0,
            "isAnomalous": True,
            "favorable": True,
        }
    }

    prompt = build_prompt([_session(baseline=baseline)])

    assert "anomalous=True" in prompt
    assert "favorable=True" in prompt


def test_unfavorable_anomaly_is_rendered_with_favorable_false():
    baseline = {
        "reactionTimeMeanMs": {
            "value": 500.0,
            "baselineMean": 300.0,
            "zScore": 3.0,
            "isAnomalous": True,
            "favorable": False,
        }
    }

    prompt = build_prompt([_session(baseline=baseline)])

    assert "anomalous=True" in prompt
    assert "favorable=False" in prompt


def test_direction_unknown_metric_is_rendered_with_favorable_none():
    baseline = {
        "dominantFrequencyHz": {
            "value": 9.0,
            "baselineMean": 4.0,
            "zScore": 3.0,
            "isAnomalous": True,
            "favorable": None,
        }
    }

    prompt = build_prompt([_session(baseline=baseline)])

    assert "favorable=None" in prompt


def test_system_prompt_does_not_instruct_a_population_or_clinical_comparison():
    lowered = SYSTEM_PROMPT.lower()

    # The old instruction told the model to actually perform a comparison
    # against other users / a clinical threshold — unsupported by any data
    # this service ever receives, and the root cause of generic/hallucinated
    # language. It must be gone, not just reworded.
    assert "compare to other users" not in lowered
    assert "compare to a clinical threshold" not in lowered
    # The replacement should instead explicitly forbid claiming one.
    assert "no such data exists" in lowered


def test_system_prompt_requires_good_anomalies_framed_as_good():
    lowered = SYSTEM_PROMPT.lower()

    assert "good news" in lowered
    assert "never hedge" in lowered or "never" in lowered
