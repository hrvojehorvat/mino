import logging
import os

from dotenv import load_dotenv

load_dotenv()

from .poller import run_forever  # noqa: E402  (must follow load_dotenv)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    interval = float(os.environ.get("POLL_INTERVAL_SECONDS", "30"))
    run_forever(interval)
