from app.services import sessions
from tests.fakessh import CID

API = "/api/v1"
WEB, WORKER = CID["web"], CID["worker"]


async def test_login_requires_host_key_confirmation_and_sends_no_password(client, fake, creds):
    r = await client.post(f"{API}/auth/login", json=creds)
    assert r.status_code == 409
    err = r.json()["error"]
    assert err["code"] == "host_key_unverified"
    assert err["details"]["fingerprint"] == fake.fingerprint
    assert fake.auth_attempts == []  # password never left before the key was confirmed
    r = await client.post(f"{API}/auth/login", json={**creds, "host_key_fingerprint": "SHA256:wrong"})
    assert r.status_code == 409 and fake.auth_attempts == []


async def test_login_ok_sets_httponly_cookie_and_stores_nothing(client, fake, creds):
    r = await client.post(f"{API}/auth/login", json={**creds, "host_key_fingerprint": fake.fingerprint})
    assert r.status_code == 200
    assert r.json() == {"host": "127.0.0.1", "port": fake.port, "username": "deploy",
                        "fingerprint": fake.fingerprint}
    assert "password" not in r.text
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "secure" in cookie and "samesite=strict" in cookie
    assert (await client.get(f"{API}/auth/me")).status_code == 200


async def test_wrong_password_is_rejected(client, fake, creds):
    r = await client.post(f"{API}/auth/login", json={
        **creds, "password": "nope", "host_key_fingerprint": fake.fingerprint})
    assert r.status_code == 401 and r.json()["error"]["code"] == "ssh_auth_failed"
    assert (await client.get(f"{API}/auth/me")).status_code == 401


async def test_endpoints_need_a_session(client):
    for method, path in [("get", "/overview"), ("get", f"/containers/{WEB}/logs"),
                         ("post", f"/containers/{WEB}/actions")]:
        r = await getattr(client, method)(API + path)
        assert r.status_code == 401, path


async def test_overview_reports_usage_and_containers(authed):
    r = await authed.get(f"{API}/overview")
    assert r.status_code == 200
    d = r.json()
    assert d["facts"]["hostname"] == "fake-host" and d["docker_available"] is True
    assert d["facts"]["cpu_count"] == 2
    assert d["metrics"]["cpu_pct"] == 50.0
    assert d["metrics"]["mem_used"] == 600000 * 1024
    names = {c["name"]: c for c in d["containers"]}
    assert names["web"]["state"] == "running" and names["web"]["metrics"]["cpu_pct"] == 1.5
    assert names["worker"]["state"] == "exited"
    assert names["web"]["labels"]["db_password"] == "[REDACTED]"


async def test_container_actions(authed, fake):
    r = await authed.post(f"{API}/containers/{WORKER}/actions", json={"action": "start"})
    assert r.status_code == 200 and r.json() == {"state": "running"}
    r = await authed.post(f"{API}/containers/{WEB}/actions", json={"action": "stop"})
    assert r.json() == {"state": "exited"}
    r = await authed.post(f"{API}/containers/{WEB}/actions", json={"action": "restart"})
    assert r.json() == {"state": "running"}
    assert (await authed.post(f"{API}/containers/{WEB}/actions", json={"action": "rm -rf /"})).status_code == 422


async def test_container_id_is_validated_before_any_command_runs(authed, fake):
    before = len(fake.commands)
    r = await authed.post(f"{API}/containers/x;reboot/actions", json={"action": "stop"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_container_id"
    assert len(fake.commands) == before


async def test_docker_error_is_redacted(authed, fake):
    fake.fail_docker = True
    r = await authed.post(f"{API}/containers/{WEB}/actions", json={"action": "stop"})
    assert r.status_code == 502 and "abc123secret" not in r.text


async def test_logs_are_redacted(authed):
    r = await authed.get(f"{API}/containers/{WEB}/logs", params={"tail": 50})
    assert r.status_code == 200
    assert "hunter2" not in r.text and "[REDACTED]" in r.text


async def test_remove(authed, fake):
    r = await authed.post(f"{API}/containers/{WEB}/remove", json={"force": False})
    assert r.status_code == 502  # running containers need force
    assert (await authed.post(f"{API}/containers/{WEB}/remove", json={"force": True})).status_code == 204
    names = [c["name"] for c in (await authed.get(f"{API}/overview")).json()["containers"]]
    assert "web" not in names


async def test_logout_drops_the_session_and_password(authed):
    s = next(iter(sessions._sessions.values()))
    assert s.password
    assert (await authed.post(f"{API}/auth/logout")).status_code == 204
    assert s.password == "" and s.conn is None
    assert (await authed.get(f"{API}/overview")).status_code == 401


async def test_session_expires_when_idle(authed, monkeypatch):
    for s in sessions._sessions.values():
        s.last_used -= 10_000
    r = await authed.get(f"{API}/overview")
    assert r.status_code == 401 and not sessions._sessions


async def test_reconnects_after_the_connection_drops(authed):
    s = next(iter(sessions._sessions.values()))
    s.conn.close()
    await s.conn.wait_closed()
    assert (await authed.get(f"{API}/overview")).status_code == 200


async def test_no_docker_on_host(client, fake, creds):
    fake.docker = False
    r = await client.post(f"{API}/auth/login", json={**creds, "host_key_fingerprint": fake.fingerprint})
    assert r.status_code == 200
    d = (await client.get(f"{API}/overview")).json()
    assert d["docker_available"] is False and d["metrics"]["mem_total"]


async def test_loopback_target_blocked_by_default(client, fake, creds, monkeypatch):
    monkeypatch.setenv("SSH_ALLOW_LOOPBACK", "false")
    get = __import__("app.core.config", fromlist=["x"]).get_settings
    get.cache_clear()
    r = await client.post(f"{API}/auth/login", json={**creds, "host_key_fingerprint": fake.fingerprint})
    assert r.status_code == 400 and r.json()["error"]["code"] == "ssh_target_blocked"


async def test_cross_origin_writes_rejected(authed):
    r = await authed.post(f"{API}/auth/logout", headers={"Origin": "https://evil.example"})
    assert r.status_code == 403


async def test_login_is_rate_limited(client, fake, creds, monkeypatch):
    monkeypatch.setenv("LOGIN_MAX_ATTEMPTS", "2")
    __import__("app.core.config", fromlist=["x"]).get_settings.cache_clear()
    codes = [(await client.post(f"{API}/auth/login", json={**creds, "password": "bad"})).status_code
             for _ in range(3)]
    assert codes[-1] == 429


async def test_wildcard_origin_allowed_in_development_only(authed, monkeypatch):
    from app.core.config import Settings
    import pytest

    with pytest.raises(ValueError):
        Settings(app_env="production", cors_origins="*", public_url="https://x.example")
    assert Settings(app_env="development", cors_origins="*").cors_origins == ["*"]
