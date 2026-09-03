"""Postgres access for the ML service.

Schema and migrations are owned by Prisma (apps/api/prisma) — this module
only ever does reads and inserts, never DDL, so there's a single source of
truth for the database structure even though two languages touch it.
See docs/decisions/0006-ml-trigger-mechanism.md.
"""

from __future__ import annotations

import os
import uuid
from contextlib import contextmanager
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

MODEL_ID = "signal-features"
# Bump whenever compute_metrics's math changes — old rows stay as history
# (see docs/data-model.md), the poller just reprocesses under the new version.
MODEL_VERSION = "2"


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return url


@contextmanager
def connect() -> Iterator[psycopg.Connection]:
    with psycopg.connect(_database_url(), row_factory=dict_row) as conn:
        yield conn


def find_unprocessed_sessions(conn: psycopg.Connection) -> list[dict[str, Any]]:
    """Completed sessions with no MLResult row yet for the current model/version."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT ts.id, ts."testType", ts."testParams"
            FROM "TestSession" ts
            LEFT JOIN "MLResult" mr
              ON mr."sessionId" = ts.id
             AND mr."modelId" = %s
             AND mr."modelVersion" = %s
            WHERE ts.status = 'Completed' AND mr.id IS NULL
            ORDER BY ts."startedAt"
            """,
            (MODEL_ID, MODEL_VERSION),
        )
        return cur.fetchall()


def load_raw_events(conn: psycopg.Connection, session_id: str) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT seq, "eventType", "tMs", x, y, "pointerId"
            FROM "RawEvent"
            WHERE "sessionId" = %s
            ORDER BY seq
            """,
            (session_id,),
        )
        return cur.fetchall()


def load_sensor_samples(conn: psycopg.Connection, session_id: str) -> list[dict[str, Any]] | None:
    with conn.cursor() as cur:
        cur.execute(
            """SELECT samples FROM "SensorSession" WHERE "sessionId" = %s""",
            (session_id,),
        )
        row = cur.fetchone()
        return row["samples"] if row else None


def save_result(conn: psycopg.Connection, session_id: str, metrics: dict[str, Any]) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO "MLResult" (id, "sessionId", "modelId", "modelVersion", metrics)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (str(uuid.uuid4()), session_id, MODEL_ID, MODEL_VERSION, Jsonb(metrics)),
        )
    conn.commit()
