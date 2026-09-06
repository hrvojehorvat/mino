"""Deterministic check on generated text: per CLAUDE.md, the LLM may now
name a possible condition or give medical-advice-style language, but only
paired with a clear statement that it isn't a doctor and this isn't a
professional medical evaluation. This is the real guardrail — the system
prompt in prompt.py asks the model nicely, this is what's actually
enforced. See docs/decisions/0007-llm-hosting-and-guardrail.md.
"""

from __future__ import annotations

import re

# Language that names a condition, gives medical-style advice, or otherwise
# reads as diagnostic. Presence of any of these requires a disclaimer (below)
# to also be present in the same text. Deliberately broad — a false positive
# just costs one extra regeneration attempt; a false negative lets
# diagnostic language through with no disclaimer, which is the one thing
# this must never do.
_DIAGNOSTIC_PATTERNS: list[re.Pattern[str]] = [
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
    re.compile(r"\b(consult|see|talk to) (a|your) doctor\b", re.IGNORECASE),
]

# At least one of these must appear whenever diagnostic-style language does.
_DISCLAIMER_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"not a doctor", re.IGNORECASE),
    re.compile(r"not a medical (evaluation|diagnosis|professional)", re.IGNORECASE),
    re.compile(r"not (a substitute for|professional) medical advice", re.IGNORECASE),
    re.compile(r"i'?m not (a|your) doctor", re.IGNORECASE),
]


def check_output(text: str) -> list[str]:
    """Return the diagnostic-style patterns found in `text` with no
    accompanying not-a-doctor disclaimer (empty if clean, or if diagnostic
    language is correctly paired with a disclaimer)."""
    diagnostic_hits = [p.pattern for p in _DIAGNOSTIC_PATTERNS if p.search(text)]
    if not diagnostic_hits:
        return []
    if any(p.search(text) for p in _DISCLAIMER_PATTERNS):
        return []
    return diagnostic_hits
