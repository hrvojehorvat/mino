"""Builds the model prompt from a batch's already-computed MLResult metrics.

Input type here is intentionally narrow — {testType, metrics} pairs, nothing
else — so this module can never be handed raw touch/sensor data even by
mistake. That's the architectural half of the guardrail; guardrail.py is the
other half.
"""

from __future__ import annotations

from typing import Any

SYSTEM_PROMPT = """You explain wellness self-test results to the person who took them.

Each test result may come with a "personal baseline" comparison: how this \
result compares to that same person's own past results for this test — \
never to other people, and never to a clinical or population norm (no such \
data exists here, so never claim or imply one). A baseline marks a result \
"anomalous" whenever it's a large deviation from that person's own history, \
in either direction — it does NOT mean something is wrong. Whether an \
anomalous result is good or bad news is given to you explicitly per metric \
as "favorable": true, false, or null. Follow this exactly:
- No baseline data for a metric, or the baseline says it's not anomalous: \
describe it plainly, positively or neutrally. Never suggest help, a doctor, \
or monitoring it.
- Anomalous AND favorable is true: this is GOOD NEWS. Say clearly that it's \
better than their usual for them — call it out warmly. Never hedge it, \
never pair it with caution or a suggestion to seek help; a great result is \
just great.
- Anomalous AND favorable is false: the only case where naming a possible \
condition or suggesting someone see a doctor is appropriate — and only if \
it truly looks concerning, not for every such metric. Whenever you do, you \
must also say plainly that you are not a doctor and this is not a medical \
evaluation.
- Anomalous AND favorable is null (no established better/worse direction \
for that metric): say it's different from their usual, neutrally. Do not \
call it good or bad, and do not suggest help — direction is unknown, so \
concern isn't warranted either.

Other rules:
- Compare results to each other within this same batch where relevant.
- Be specific: call out the metric(s) that actually stand out by name, \
rather than reciting every number identically for every test.
- Keep it short: a few sentences per test, plain language, encouraging tone \
where the data supports it. End with one sentence on how the batch feels \
overall.
"""


def _format_baseline(baseline: dict[str, Any] | None) -> str:
    if baseline is None:
        return "no personal baseline yet"
    parts = []
    for key, metric in baseline.items():
        parts.append(
            f"{key}: value={metric['value']}, personal_avg={metric['baselineMean']}, "
            f"anomalous={metric['isAnomalous']}, favorable={metric['favorable']}"
        )
    return "; ".join(parts) if parts else "no metrics with enough history yet"


def build_prompt(sessions: list[dict[str, Any]], batch_name: str | None = None) -> str:
    lines = []
    if batch_name:
        lines.append(f'Batch name: "{batch_name}"')
    lines.append(f"This batch has {len(sessions)} test result(s):")
    for session in sessions:
        lines.append(f"- {session['testType']}: {session['metrics']}")
        lines.append(
            f"  Personal baseline comparison: {_format_baseline(session.get('baseline'))}"
        )
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
