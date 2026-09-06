"""Local stand-in for this service, for manual testing of apps/api's explain
flow without spending Modal GPU credits. Implements the same
{sessions, batchName} -> {ok, explanationText} contract as app.py, but always
returns a fixed canned explanation instead of generating one for real.

stdlib-only (no Flask/vLLM) so it runs even on machines that can't install
this service's real dependencies at all (see docs/decisions/0007's note on
vLLM's cudnn dependency having no macOS x86_64 wheel) — this is the same
mino_llm package pytest already imports directly from for the fast tests.

Run from services/llm-explain/:
    python3 -m mino_llm.dev_stub
Then point apps/api's LLM_SERVICE_URL at it (http://localhost:5002 is both
services' shared default, so usually no .env change is needed at all).
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_EXPLANATION = (
    "This is a placeholder explanation from the local dev stub "
    "(mino_llm/dev_stub.py) — no real model was called, so it does not "
    "reflect your actual results. Point LLM_SERVICE_URL at a real "
    "services/llm-explain deployment to get a genuine explanation."
)


class StubHandler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send_json(200, {"status": "ok"})
            return
        self._send_json(404, {})

    def do_POST(self) -> None:
        if self.path != "/explain":
            self._send_json(404, {})
            return
        length = int(self.headers.get("Content-Length", 0))
        self.rfile.read(length)  # request isn't inspected — response is always canned
        text = os.environ.get("LLM_STUB_TEXT", DEFAULT_EXPLANATION)
        self._send_json(200, {"ok": True, "explanationText": text})

    def log_message(self, format: str, *args) -> None:
        pass  # quieter than BaseHTTPRequestHandler's default stderr logging


def main() -> None:
    port = int(os.environ.get("PORT", "5002"))
    server = ThreadingHTTPServer(("0.0.0.0", port), StubHandler)
    print(f"mino_llm dev stub listening on :{port} — every /explain call returns a canned response")
    server.serve_forever()


if __name__ == "__main__":
    main()
