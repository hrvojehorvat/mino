"""Deterministic check that generated text never leaves this service if it
reads as diagnostic/medical. This is the real guardrail — the system prompt
in prompt.py asks the model nicely, this is what's actually enforced.
See docs/decisions/0007-llm-hosting-and-guardrail.md.
"""

from __future__ import annotations

import re

# Substring/pattern matches, case-insensitive. Deliberately broad — a false
# positive just costs one extra regeneration attempt; a false negative lets
# diagnostic language through, which is the one thing this must never do.
_PROHIBITED_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"diagnos", re.IGNORECASE),
    re.compile(r"\bdisease\b", re.IGNORECASE),
    re.compile(r"\bdisorder\b", re.IGNORECASE),
    re.compile(r"\bsyndrome\b", re.IGNORECASE),
    re.compile(r"\bsymptom", re.IGNORECASE),
    re.compile(r"you (have|may have|might have|could have) [a-z\s]*\b(parkinson|alzheimer|dementia|tremor|ataxia)", re.IGNORECASE),
    re.compile(r"\bcondition indicates\b", re.IGNORECASE),
    re.compile(r"\bmedical (advice|attention|treatment|professional)\b", re.IGNORECASE),
    re.compile(r"\btreatment\b", re.IGNORECASE),
    re.compile(r"\bprognosis\b", re.IGNORECASE),
    re.compile(r"\bpathological\b", re.IGNORECASE),
    re.compile(r"\bconsult (a|your) doctor\b", re.IGNORECASE),
]


def check_output(text: str) -> list[str]:
    """Return the list of prohibited patterns found in `text` (empty if clean)."""
    violations = []
    for pattern in _PROHIBITED_PATTERNS:
        if pattern.search(text):
            violations.append(pattern.pattern)
    return violations
