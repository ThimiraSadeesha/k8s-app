"""In-memory login sessions. Nothing is written to disk or a database: the SSH login lives only in
this process, is dropped on logout or expiry, and disappears when the API restarts."""

import asyncio
import hashlib
import secrets
import time
from dataclasses import dataclass, field

import asyncssh

from app.core.config import get_settings
from app.core.errors import Unauthorized


@dataclass
class Session:
    host: str
    port: int
    username: str
    ip: str  # the address vetted at login; reconnects go here, with no second DNS lookup
    host_key: str  # openssh public key, pinned for every reconnect
    fingerprint: str
    password: str = field(repr=False)
    created: float = field(default_factory=time.monotonic)
    last_used: float = field(default_factory=time.monotonic)
    conn: asyncssh.SSHClientConnection | None = field(default=None, repr=False)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)


_sessions: dict[str, Session] = {}


def _key(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create(session: Session) -> str:
    sweep()
    if len(_sessions) >= get_settings().max_sessions:
        oldest = min(_sessions, key=lambda k: _sessions[k].last_used)
        close(_sessions.pop(oldest))
    token = secrets.token_urlsafe(32)
    _sessions[_key(token)] = session
    return token


def get(token: str | None) -> Session:
    s = _sessions.get(_key(token)) if token else None
    if s is None:
        raise Unauthorized("Not signed in", code="not_authenticated")
    if _expired(s, time.monotonic()):
        destroy(token)
        raise Unauthorized("Session expired, sign in again", code="session_expired")
    s.last_used = time.monotonic()
    return s


def destroy(token: str | None) -> None:
    s = _sessions.pop(_key(token), None) if token else None
    if s:
        close(s)


def close(s: Session) -> None:
    if s.conn is not None:
        s.conn.close()
    s.conn = None
    s.password = ""


def _expired(s: Session, now: float) -> bool:
    cfg = get_settings()
    return now - s.last_used > cfg.session_idle_seconds or now - s.created > cfg.session_max_seconds


def sweep() -> int:
    now = time.monotonic()
    dead = [k for k, s in _sessions.items() if _expired(s, now)]
    for k in dead:
        close(_sessions.pop(k))
    return len(dead)


async def sweep_forever(interval: int = 60) -> None:
    while True:
        await asyncio.sleep(interval)
        sweep()


def close_all() -> None:
    for s in _sessions.values():
        close(s)
    _sessions.clear()
