from fastapi import APIRouter, Depends, Request, Response

from app.api.deps import SESSION_COOKIE, client_ip, current_session
from app.core.config import get_settings
from app.core.ratelimit import get_limiter
from app.schemas.infra import LoginIn
from app.services import sessions, ssh
from app.services.sessions import Session

router = APIRouter(prefix="/auth", tags=["auth"])


def _me(s: Session) -> dict:
    return {"host": s.host, "port": s.port, "username": s.username, "fingerprint": s.fingerprint}


@router.post("/login")
async def login(body: LoginIn, request: Request, response: Response):
    """Sign in with the server's own SSH login. Nothing is stored beyond the in-memory session."""
    cfg = get_settings()
    await get_limiter().hit(f"login:{client_ip(request)}", cfg.login_max_attempts, cfg.login_window_seconds)
    session = await ssh.login(body.host, body.port, body.username, body.password,
                              body.host_key_fingerprint)
    token = sessions.create(session)
    response.set_cookie(
        SESSION_COOKIE, token, httponly=True, secure=bool(cfg.cookie_secure), samesite="strict",
        max_age=cfg.session_max_seconds, path="/")
    return _me(session)


@router.get("/me")
async def me(session: Session = Depends(current_session)):
    return _me(session)


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response):
    sessions.destroy(request.cookies.get(SESSION_COOKIE))
    response.delete_cookie(SESSION_COOKIE, path="/")
