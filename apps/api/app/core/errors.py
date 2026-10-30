"""Domain errors rendered as a consistent JSON envelope: {"error": {"code", "message"}}."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ZentError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(self, message: str = "", *, code: str | None = None, headers: dict | None = None,
                 details=None):
        super().__init__(message or self.code)
        self.message = message or self.code.replace("_", " ")
        if code:
            self.code = code
        self.headers = headers
        self.details = details


class Unauthorized(ZentError):
    status_code, code = 401, "unauthorized"


class Forbidden(ZentError):
    status_code, code = 403, "forbidden"


class NotFound(ZentError):
    status_code, code = 404, "not_found"


class Conflict(ZentError):
    status_code, code = 409, "conflict"


class TooManyRequests(ZentError):
    status_code, code = 429, "rate_limited"


def _envelope(code: str, message: str, details=None) -> dict:
    from app.core.logging import request_id_var

    body = {"error": {"code": code, "message": message, "request_id": request_id_var.get()}}
    if details is not None:
        body["error"]["details"] = details
    return body


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ZentError)
    async def _zent(_: Request, exc: ZentError):
        return JSONResponse(
            _envelope(exc.code, exc.message, exc.details), status_code=exc.status_code, headers=exc.headers
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        details = [
            {"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]}
            for e in exc.errors()
        ]
        return JSONResponse(_envelope("validation_error", "Invalid request", details), status_code=422)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        import logging

        logging.getLogger("zent.api").exception(
            "unhandled error", extra={"request_id": getattr(request.state, "request_id", None)}
        )
        # Never leak internals to clients.
        return JSONResponse(_envelope("internal_error", "Internal server error"), status_code=500)
