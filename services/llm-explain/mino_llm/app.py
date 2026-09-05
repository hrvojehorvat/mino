"""Stateless explanation service: given one batch's already-computed
MLResult metrics, return a plain-language explanation. No Postgres access,
no raw session data — apps/api's LlmService loads MLResult rows and calls
this. See docs/decisions/0007-llm-hosting-and-guardrail.md.

The guardrail is enforced here, before any text leaves this service: a
violating generation is retried once with a stricter prompt, and a second
violation is reported as a failure rather than ever being returned.
"""

from __future__ import annotations

from typing import Any

from flask import Flask, jsonify, request

from .guardrail import check_output
from .model import generate
from .prompt import SYSTEM_PROMPT, build_prompt, build_retry_prompt

app = Flask(__name__)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/explain")
def explain() -> Any:
    body = request.get_json(force=True)
    sessions = body["sessions"]
    batch_name = body.get("batchName")

    text = generate(SYSTEM_PROMPT, build_prompt(sessions, batch_name))
    if not check_output(text):
        return jsonify({"ok": True, "explanationText": text})

    text = generate(SYSTEM_PROMPT, build_retry_prompt(sessions, batch_name))
    if not check_output(text):
        return jsonify({"ok": True, "explanationText": text})

    return jsonify({"ok": False, "reason": "guardrail_violation"})
