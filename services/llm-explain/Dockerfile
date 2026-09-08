# Packages only mino_llm/dev_stub.py — the local canned-response stand-in
# for this service (see decisions/0007-llm-hosting-and-guardrail.md), not
# the real vLLM-backed app.py, which is hosted on Modal instead. The stub is
# stdlib-only, so no dependency install is needed at all.
#
# Build context is this folder, e.g.:
#   docker build -t mino-llm-explain services/llm-explain

FROM python:3.11-slim
WORKDIR /app

COPY mino_llm/__init__.py mino_llm/dev_stub.py mino_llm/

EXPOSE 5002
CMD ["python3", "-m", "mino_llm.dev_stub"]
