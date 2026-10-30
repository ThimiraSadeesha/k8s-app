"""Structured JSON logging with credential redaction."""

import json
import logging
import re
from contextvars import ContextVar
from datetime import UTC, datetime

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

_SENSITIVE_KEY = re.compile(r"(pass(word)?|secret|token|authorization|cookie|api[_-]?key|private)", re.I)
_BEARER = re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]+")
_KV = re.compile(r"(?i)\b(password|secret|token|api[_-]?key)(\s*[=:]\s*)([^\s,;&\"']+)")


def redact_text(text: str) -> str:
    text = _BEARER.sub(r"\1[REDACTED]", text)
    return _KV.sub(r"\1\2[REDACTED]", text)


def redact(value):
    if isinstance(value, dict):
        return {
            k: "[REDACTED]" if _SENSITIVE_KEY.search(str(k)) else redact(v) for k, v in value.items()
        }
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, str):
        return redact_text(value)
    return value


_RESERVED = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {"message", "asctime"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": redact_text(record.getMessage()),
            "request_id": request_id_var.get(),
        }
        for k, v in record.__dict__.items():
            if k not in _RESERVED and v is not None:
                entry[k] = redact({k: v})[k]
        if record.exc_info:
            entry["exc"] = redact_text(self.formatException(record.exc_info))
        return json.dumps(entry, default=str)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    logging.getLogger("uvicorn.access").handlers[:] = []
    logging.getLogger("uvicorn.access").propagate = False
    # Per-poll chatter (every connection step and the full collection script) buries real events.
    # Warnings and errors still come through; ZENT's own "zent.ssh" / "zent.db" loggers are unaffected.
    for noisy in ("asyncssh", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(max(logging.WARNING, root.level))
