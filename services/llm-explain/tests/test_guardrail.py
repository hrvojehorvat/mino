"""Pure tests for the guardrail's output check — no model call, runs fast in
normal CI. The real-model eval set lives in test_app.py and is run
separately (slow, GPU-dependent).
"""

from mino_llm.guardrail import check_output

CLEAN_EXAMPLES = [
    "Your tap timing was a bit more spread out in this batch than your other "
    "results, and your reaction times were fairly consistent across trials.",
    "Finger tracing showed a smooth, steady path this time. Phone stability "
    "results were similar to your usual range.",
    "",
]

VIOLATING_EXAMPLES = [
    "This pattern is consistent with a diagnosis of early Parkinson's disease.",
    "Your reaction time syndrome suggests a movement disorder.",
    "These symptoms indicate you should consult a doctor for treatment.",
    "You may have Parkinson's based on this tremor pattern.",
    "This condition indicates a neurological pathological process.",
]


def test_clean_text_has_no_violations():
    for text in CLEAN_EXAMPLES:
        assert check_output(text) == []


def test_violating_text_is_flagged():
    for text in VIOLATING_EXAMPLES:
        assert check_output(text) != [], f"expected a violation in: {text!r}"
