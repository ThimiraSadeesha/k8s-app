import asyncio
import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.deps import SAFE_METHODS
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.core.limits import BodyLimitMiddleware
from app.core.payload import EncryptedPayloadMiddleware
from app.core.logging import configure_logging, request_id_var
from app.services import sessions

log = logging.getLogger("zent.api")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-site",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
}


def create_app() -> FastAPI:
    settings = get_settings()  # fails fast on invalid production configuration
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        task = asyncio.create_task(sessions.sweep_forever())
        yield
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        sessions.close_all()

    docs = None if settings.app_env == "production" else "/docs"
    app = FastAPI(title="ZENT API", version="0.3.0", lifespan=lifespan,
                  docs_url=docs, redoc_url=None, openapi_url="/openapi.json" if docs else None)
    install_error_handlers(app)
    if settings.encryption_key.get_secret_value():  # innermost, so errors are encrypted too
        app.add_middleware(EncryptedPayloadMiddleware, secret=settings.encryption_key.get_secret_value())
    allowed = set(settings.cors_origins)
    any_origin = "*" in allowed  # development only; production config rejects it

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        rid = request.headers.get("x-request-id", "")[:64] or uuid.uuid4().hex
        request.state.request_id = rid
        token = request_id_var.set(rid)
        try:
            # Defence in depth against CSRF: browsers always send Origin on cross-site writes.
            origin = request.headers.get("origin")
            if request.method not in SAFE_METHODS and origin and not any_origin and origin not in allowed:
                resp = JSONResponse({"error": {"code": "bad_origin", "message": "Origin not allowed"}},
                                    status_code=403)
            else:
                resp = await call_next(request)
        finally:
            request_id_var.reset(token)
        resp.headers["X-Request-ID"] = rid
        if docs and request.url.path in ("/docs", "/docs/oauth2-redirect"):
            # Swagger UI (non-production only) needs its own scripts/styles; the API itself stays locked down.
            resp.headers["Content-Security-Policy"] = (
                "default-src 'none'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "img-src 'self' data: https://fastapi.tiangolo.com; connect-src 'self'; frame-ancestors 'none'")
        for k, v in SECURITY_HEADERS.items():
            resp.headers.setdefault(k, v)
        if settings.app_env == "production":
            resp.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
        return resp

    app.add_middleware(CORSMiddleware, allow_origins=[] if any_origin else settings.cors_origins,
                       allow_origin_regex=".*" if any_origin else None, allow_credentials=True,
                       allow_methods=["GET", "POST"],
                       allow_headers=["Content-Type", "X-Request-ID"])
    app.add_middleware(BodyLimitMiddleware, max_bytes=settings.max_request_bytes)

    @app.get("/healthz", include_in_schema=False)
    async def healthz():
        return {"status": "ok"}

    app.include_router(api_router)
    return app


app = create_app()
