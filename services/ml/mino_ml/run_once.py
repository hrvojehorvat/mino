"""One-shot manual run: `uv run python -m mino_ml.run_once` processes
whatever's currently unprocessed and exits, instead of looping forever.
Useful for manual verification without waiting on the poll interval.
"""

import logging

from dotenv import load_dotenv

load_dotenv()

from . import db  # noqa: E402  (must follow load_dotenv)
from .poller import run_once  # noqa: E402

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    with db.connect() as conn:
        count = run_once(conn)
    print(f"processed {count} session(s)")
