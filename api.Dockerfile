FROM python:3.13-slim-bookworm AS builder

WORKDIR /app

ENV VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

COPY apps/api/pyproject.toml ./

RUN python -m venv "$VIRTUAL_ENV" && \
    pip install --upgrade pip && \
    pip install .

FROM python:3.13-slim-bookworm AS prod

WORKDIR /app

ENV VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH=/app \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_ENV=production \
    WEB_CONCURRENCY=1

RUN groupadd --system --gid 10001 zent && \
    useradd --system --uid 10001 --gid zent \
    --no-create-home --shell /usr/sbin/nologin zent

COPY --from=builder /opt/venv /opt/venv
COPY apps/api/app ./app

USER zent

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=4s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys;sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz',timeout=3).status==200 else 1)"

CMD ["sh", "-c", "python -c 'from app.core.config import get_settings; get_settings()' && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-server-header"]
