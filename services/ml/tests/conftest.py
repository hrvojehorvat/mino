import uuid
from pathlib import Path

import pytest
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env.test")

from mino_ml import db  # noqa: E402  (must follow load_dotenv)


@pytest.fixture
def conn():
    with db.connect() as connection:
        yield connection


@pytest.fixture(autouse=True)
def clean_db(conn):
    """Wipes session-related tables before each test — same pattern as
    apps/api/test/sessions.e2e-spec.ts's beforeEach, against the same
    mino_test database.
    """
    with conn.cursor() as cur:
        cur.execute('DELETE FROM "MLResult"')
        cur.execute('DELETE FROM "RawEvent"')
        cur.execute('DELETE FROM "SensorSession"')
        cur.execute('DELETE FROM "TestSession"')
        cur.execute('DELETE FROM "User"')
    conn.commit()
    yield


@pytest.fixture
def make_session(conn):
    """Inserts a minimal User + TestSession row, returns the session id."""

    def _make(test_type: str = "FingerTapping", status: str = "Completed") -> str:
        with conn.cursor() as cur:
            device_id = str(uuid.uuid4())
            user_id = str(uuid.uuid4())
            cur.execute(
                """INSERT INTO "User" (id, "deviceId") VALUES (%s, %s)""",
                (user_id, device_id),
            )
            session_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO "TestSession"
                    (id, "userId", "testType", "startedAt", "endedAt",
                     "clientAppVersion", "deviceMetadata", status)
                VALUES (%s, %s, %s, now(), now(), '0.0.1', '{}', %s)
                """,
                (session_id, user_id, test_type, status),
            )
        conn.commit()
        return session_id

    return _make


@pytest.fixture
def insert_events(conn):
    """Inserts RawEvent rows for a session, in the given order (seq is
    assigned by list position)."""

    def _insert(session_id: str, events: list[dict]) -> None:
        with conn.cursor() as cur:
            for seq, event in enumerate(events):
                cur.execute(
                    """
                    INSERT INTO "RawEvent"
                        (id, "sessionId", seq, "eventType", "tMs", x, y, "pointerId")
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        str(uuid.uuid4()),
                        session_id,
                        seq,
                        event["eventType"],
                        event["tMs"],
                        event.get("x"),
                        event.get("y"),
                        event.get("pointerId"),
                    ),
                )
        conn.commit()

    return _insert
