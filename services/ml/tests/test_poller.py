from mino_ml import db
from mino_ml.poller import run_once


def test_processes_an_unprocessed_session(conn, make_session):
    session_id = make_session()

    count = run_once(conn)

    assert count == 1
    with conn.cursor() as cur:
        cur.execute('SELECT "sessionId", "modelId", "modelVersion", metrics FROM "MLResult"')
        rows = cur.fetchall()
    assert len(rows) == 1
    assert rows[0]["sessionId"] == session_id
    assert rows[0]["modelId"] == db.MODEL_ID
    assert rows[0]["modelVersion"] == db.MODEL_VERSION
    # No RawEvent rows were inserted, so the real Finger Tapping feature
    # computation naturally produces a zero-tap result — proving it ran,
    # not that the pipeline is still Step 1's unconditional placeholder.
    assert rows[0]["metrics"]["tapCount"] == 0


def test_does_not_reprocess_a_session_that_already_has_a_result(conn, make_session):
    make_session()
    run_once(conn)

    count = run_once(conn)

    assert count == 0


def test_ignores_sessions_that_are_not_completed(conn, make_session):
    make_session(status="Aborted")

    count = run_once(conn)

    assert count == 0
