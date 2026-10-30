"""Agentless server access over SSH.

Security properties:
- The password is never stored: it lives in the in-memory session only and is dropped on logout.
- The host key is read *without authenticating*, shown to the operator, and must be confirmed.
  The confirmed key is pinned and verified during the handshake, before the password is sent.
- Only fixed commands run; container ids are validated and shell-quoted.
- Loopback, link-local (cloud metadata) and unspecified targets are refused, and the connection
  goes to the address that was validated (no second DNS lookup).
"""

import asyncio
import ipaddress
import logging
import re
import shlex
import socket
from datetime import UTC, datetime

import asyncssh

from app.core.config import Settings, get_settings
from app.core.errors import ZentError
from app.core.logging import redact_text
from app.schemas.infra import ReportIn
from app.services import sshparse
from app.services.sessions import Session

log = logging.getLogger("zent.ssh")
_HOST = re.compile(r"^[A-Za-z0-9]([A-Za-z0-9.\-:]{0,253}[A-Za-z0-9])?$")
_DOCKER_ID = re.compile(r"^[a-f0-9]{12,64}$")
MAX_OUTPUT = 2_000_000


class SshError(ZentError):
    status_code = 502

    def __init__(self, message: str, code: str, status_code: int | None = None, details=None):
        super().__init__(message, code=code, details=details)
        if status_code:
            self.status_code = status_code


def validate_host_syntax(host: str) -> str:
    host = host.strip()
    if not _HOST.match(host):
        raise ValueError("invalid host")
    return host


async def resolve_target(host: str, port: int, settings: Settings | None = None) -> str:
    """Resolve once and vet every address. Returns the IP to connect to."""
    settings = settings or get_settings()
    try:
        infos = await asyncio.wait_for(
            asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM),
            settings.ssh_connect_timeout_seconds)
    except (OSError, TimeoutError):
        raise SshError("Host could not be resolved", "ssh_unreachable") from None
    addrs = [ipaddress.ip_address(i[4][0]) for i in infos]
    for a in addrs:
        blocked = a.is_unspecified or a.is_multicast or a.is_link_local or a.is_reserved or \
            (a.is_loopback and not settings.ssh_allow_loopback)
        if blocked:
            raise SshError("This address is not allowed as an SSH target", "ssh_target_blocked", 400)
    return str(addrs[0])


async def fetch_host_key(ip: str, port: int) -> tuple[str, str]:
    """(openssh public key, sha256 fingerprint). Never authenticates."""
    timeout = get_settings().ssh_connect_timeout_seconds
    try:
        key = await asyncio.wait_for(asyncssh.get_server_host_key(ip, port=port), timeout)
    except (OSError, asyncssh.Error, TimeoutError):
        raise SshError("Could not read the server's SSH host key", "ssh_unreachable") from None
    if key is None:
        raise SshError("Server did not present a host key", "ssh_unreachable")
    return key.export_public_key("openssh").decode().strip(), key.get_fingerprint("sha256")


async def _open(ip: str, port: int, username: str, password: str, host_key: str):
    settings = get_settings()
    pinned = asyncssh.import_public_key(host_key)
    try:
        return await asyncio.wait_for(asyncssh.connect(
            ip, port, username=username, password=password,
            known_hosts=([pinned], [], [], [], [], [], [], None),  # checked before authenticating
            client_keys=None, agent_path=None, agent_forwarding=False, config=None,
            preferred_auth=("password", "keyboard-interactive"),
            connect_timeout=settings.ssh_connect_timeout_seconds,
            login_timeout=settings.ssh_connect_timeout_seconds,
        ), settings.ssh_connect_timeout_seconds + 5)
    except asyncssh.HostKeyNotVerifiable:
        raise SshError("The server's host key changed. Possible interception, or the server was "
                       "rebuilt: sign in again and verify the new fingerprint",
                       "ssh_host_key_mismatch", 409) from None
    except asyncssh.PermissionDenied:
        raise SshError("SSH authentication failed (wrong username or password)",
                       "ssh_auth_failed", 401) from None
    except (OSError, asyncssh.Error, TimeoutError) as exc:
        log.warning("ssh connect failed: %s", type(exc).__name__)
        raise SshError("Could not connect to the server over SSH", "ssh_unreachable") from None


async def login(host: str, port: int, username: str, password: str,
                fingerprint: str | None) -> Session:
    """Authenticate over SSH and return a (not yet registered) session."""
    ip = await resolve_target(host, port)
    host_key, fp = await fetch_host_key(ip, port)
    if fingerprint != fp:
        # Not (or no longer) confirmed: hand the fingerprint back so a human can check it.
        raise SshError(
            "Confirm the server's host key fingerprint to continue" if fingerprint is None
            else "The host key changed since you confirmed it. Verify the new fingerprint",
            "host_key_unverified", 409, details={"fingerprint": fp, "host": host, "port": port})
    conn = await _open(ip, port, username, password, host_key)
    return Session(host=host, port=port, username=username, ip=ip, host_key=host_key,
                   fingerprint=fp, password=password, conn=conn)


async def _conn(s: Session, fresh: bool = False) -> asyncssh.SSHClientConnection:
    async with s.lock:
        if fresh and s.conn is not None:
            s.conn.close()
            s.conn = None
        if s.conn is None or s.conn.is_closed():
            s.conn = await _open(s.ip, s.port, s.username, s.password, s.host_key)
        return s.conn


async def run(s: Session, command: str, timeout: int | None = None) -> tuple[int, str]:
    timeout = timeout or get_settings().ssh_command_timeout_seconds
    for attempt in (0, 1):
        conn = await _conn(s, fresh=attempt == 1)
        try:
            r = await asyncio.wait_for(conn.run(command, check=False), timeout)
            break
        except (asyncssh.ConnectionLost, asyncssh.DisconnectError, BrokenPipeError, ConnectionError):
            if attempt:  # dropped twice in a row
                raise SshError("The SSH connection dropped", "ssh_command_failed") from None
        except (TimeoutError, asyncssh.Error, OSError):
            raise SshError("Command on the server timed out", "ssh_command_failed") from None
    out = r.stdout if isinstance(r.stdout, str) else (r.stdout or b"").decode(errors="replace")
    return r.exit_status or 0, out[:MAX_OUTPUT]


# ---- operations ----------------------------------------------------------------------------


async def collect(s: Session) -> ReportIn:
    _, out = await run(s, sshparse.COLLECT_SCRIPT)
    try:
        return sshparse.build_report(out, datetime.now(UTC))
    except ValueError:
        raise SshError("Unexpected output from the server", "ssh_bad_output") from None


def _check_id(docker_id: str) -> str:
    if not _DOCKER_ID.match(docker_id):
        raise SshError("Invalid container id", "invalid_container_id", 400)
    return shlex.quote(docker_id)


def _fail(out: str) -> SshError:
    return SshError(redact_text(out.strip()[:300]) or "Docker command failed", "docker_command_failed")


async def container_action(s: Session, docker_id: str, action: str) -> dict:
    cid = _check_id(docker_id)
    code, out = await run(s, f"docker {action} {cid} 2>&1")
    if code != 0:
        raise _fail(out)
    _, st = await run(s, f"docker inspect --format '{{{{.State.Status}}}}' {cid} 2>/dev/null")
    return {"state": st.strip() or None}


async def container_remove(s: Session, docker_id: str, force: bool) -> None:
    code, out = await run(s, f"docker rm {'-f ' if force else ''}{_check_id(docker_id)} 2>&1")
    if code != 0:
        raise _fail(out)


async def container_logs(s: Session, docker_id: str, tail: int) -> list[str]:
    code, out = await run(s, f"docker logs --tail {int(tail)} {_check_id(docker_id)} 2>&1")
    if code != 0:
        raise _fail(out)
    return [redact_text(line) for line in out.splitlines()[-int(tail):]]
