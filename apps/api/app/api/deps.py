from fastapi import Request

from app.core.config import get_settings
from app.services import sessions
from app.services.sessions import Session

SESSION_COOKIE = "zent_session"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def client_ip(request: Request) -> str | None:
    """Peer address, or the Nth-from-right X-Forwarded-For entry when behind N trusted proxies.
    Never trust the leftmost entry: the client controls it."""
    n = get_settings().trusted_proxy_count
    if n > 0:
        parts = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
        if len(parts) >= n:
            return parts[-n][:64]
    return request.client.host if request.client else None


def current_session(request: Request) -> Session:
    return sessions.get(request.cookies.get(SESSION_COOKIE))
