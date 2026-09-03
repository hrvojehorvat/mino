"""The whole trigger mechanism: check Postgres for sessions without a
result yet, compute metrics for each, save the result. See
docs/decisions/0006-ml-trigger-mechanism.md — no queue, just a poll loop.
"""

from __future__ import annotations

import logging
import time

import psycopg

from . import db
from .features import compute_metrics

logger = logging.getLogger("mino_ml")


def process_session(conn: psycopg.Connection, session: dict) -> None:
    session_id = session["id"]
    test_type = session["testType"]
    raw_events = db.load_raw_events(conn, session_id)
    sensor_samples = db.load_sensor_samples(conn, session_id)
    test_params = session.get("testParams")
    metrics = compute_metrics(test_type, raw_events, sensor_samples, test_params)
    db.save_result(conn, session_id, metrics)
    logger.info("processed session %s (%s)", session_id, test_type)


def run_once(conn: psycopg.Connection) -> int:
    """Processes every currently unprocessed session once. Returns the count."""
    sessions = db.find_unprocessed_sessions(conn)
    for session in sessions:
        process_session(conn, session)
    return len(sessions)


def run_forever(interval_seconds: float) -> None:
    logger.info("mino-ml poller starting, interval=%ss", interval_seconds)
    with db.connect() as conn:
        while True:
            count = run_once(conn)
            if count:
                logger.info("processed %d session(s)", count)
            time.sleep(interval_seconds)
