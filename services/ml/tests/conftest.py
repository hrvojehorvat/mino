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
