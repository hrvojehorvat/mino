# Build context is this folder, e.g.:
#   docker build -t mino-ml services/ml

FROM python:3.11-slim
WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY mino_ml mino_ml
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 5001
CMD ["gunicorn", "--bind", "0.0.0.0:5001", "mino_ml.app:app"]
