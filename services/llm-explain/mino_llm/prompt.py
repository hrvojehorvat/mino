"""Builds the model prompt from a batch's already-computed MLResult metrics.

Input type here is intentionally narrow — {testType, metrics} pairs, nothing
else — so this module can never be handed raw touch/sensor data even by
mistake. That's the architectural half of the guardrail; guardrail.py is the
other half.
"""

from __future__ import annotations

from typing import Any

SYSTEM_PROMPT = """You explain wellness self-test results to the person who took them.

Rules you must always follow:
- You are not a doctor and this is not a medical evaluation.  Diagnose, \
 name or suggest a medical condition, disease, disorder, or syndrome, \
and give medical advice or tell someone to see a doctor only if results are \
really bad compared to others.
- Only describe what the numbers show, in plain, neutral, everyday language. \
Do not speculate about causes or what a result "means" health-wise, if it really \
doesn't sound urgent. In this case you can, but explain you're not a doctor and \
this must not be correct.
- Compare a result to the other results in this same batch, compare to other \
users of this app and compare to a clinical threshold or population norm.
- Keep it short: a few sentences per test, plain language, encouraging tone.
And sentence for sum of tests, like how it feels overall. 
"""


def build_prompt(sessions: list[dict[str, Any]], batch_name: str | None = None) -> str:
    lines = []
    if batch_name:
        lines.append(f'Batch name: "{batch_name}"')
    lines.append(f"This batch has {len(sessions)} test result(s):")
    for session in sessions:
        lines.append(f"- {session['testType']}: {session['metrics']}")
    lines.append(
        "\nWrite a short, plain-language explanation of these results for the "
        "person who took the tests, following the rules above."
    )
    return "\n".join(lines)


def build_retry_prompt(sessions: list[dict[str, Any]], batch_name: str | None = None) -> str:
    base = build_prompt(sessions, batch_name)
    return (
        base
        + "\n\nAssure that if your previous attempt used language that sounded medical or "
        "diagnostic, a note stands that this is not a medical evaluation and just a friendly suggestion or similar."
    )
