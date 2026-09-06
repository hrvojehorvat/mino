"""Stateless compute service: given one session's raw data, return its
metrics. No Postgres access here at all — NestJS finds pending sessions,
loads their raw data, calls this, and saves the result. See
docs/decisions/0006-ml-trigger-mechanism.md (Update 3).
"""

from __future__ import annotations

from typing import Any

from flask import Flask, jsonify, request

from .baseline import compute_baseline
from .features import compute_metrics

app = Flask(__name__)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/compute")
def compute() -> Any:
    body = request.get_json(force=True)
    metrics = compute_metrics(
        body["testType"],
        body.get("rawEvents", []),
        body.get("sensorSamples"),
        body.get("testParams"),
    )
    return jsonify(metrics)


@app.post("/baseline")
def baseline() -> Any:
    body = request.get_json(force=True)
    result = compute_baseline(body.get("history", []), body["current"])
    return jsonify(result)
