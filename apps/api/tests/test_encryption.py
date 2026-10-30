import json

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core import ratelimit
from app.core.config import get_settings
from app.core.payload import REQ_AAD, RES_AAD, PayloadCrypto
from app.main import create_app
from app.services import sessions

KEY = "unit-test-encryption-key-123456"
API = "/api/v1"
WEB = "a" * 64


@pytest_asyncio.fixture
async def enc(fake, monkeypatch):
    monkeypatch.setenv("ENCRYPTION_KEY", KEY)
    get_settings.cache_clear()
    ratelimit.get_limiter().reset()
    sessions.close_all()
    async with AsyncClient(transport=ASGITransport(app=create_app()), base_url="https://test",
                           headers={"Origin": "http://localhost:3000"}) as c:
        yield c
    sessions.close_all()
    monkeypatch.delenv("ENCRYPTION_KEY")
    get_settings.cache_clear()


crypto = PayloadCrypto(KEY)


def wrap(obj) -> dict:
    return {"d": crypto.encrypt(json.dumps(obj).encode(), REQ_AAD)}


def unwrap(resp):
    assert resp.headers.get("x-zent-enc") == "1", resp.text
    return json.loads(crypto.decrypt(resp.json()["d"], RES_AAD))


async def login(enc, fake, creds):
    return await enc.post(f"{API}/auth/login", json=wrap({**creds, "host_key_fingerprint": fake.fingerprint}))


async def test_plaintext_body_is_refused(enc, creds):
    r = await enc.post(f"{API}/auth/login", json=creds)
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_payload"


async def test_tampered_or_wrong_key_payload_is_refused(enc, creds):
    token = wrap(creds)["d"]
    flipped = token[:-3] + ("AAA" if token[-3:] != "AAA" else "BBB")
    assert (await enc.post(f"{API}/auth/login", json={"d": flipped})).status_code == 400
    other = PayloadCrypto("some-other-key-entirely-0000").encrypt(b"{}", REQ_AAD)
    assert (await enc.post(f"{API}/auth/login", json={"d": other})).status_code == 400
    wrong_aad = crypto.encrypt(json.dumps(creds).encode(), RES_AAD)  # a response blob is not a request
    assert (await enc.post(f"{API}/auth/login", json={"d": wrong_aad})).status_code == 400


async def test_login_overview_and_actions_round_trip_encrypted(enc, fake, creds):
    r = await login(enc, fake, creds)
    assert r.status_code == 200
    assert creds["password"] not in r.text and "deploy" not in r.text  # nothing readable on the wire
    assert unwrap(r)["username"] == "deploy"

    r = await enc.get(f"{API}/overview")
    assert "fake-host" not in r.text and "web" not in r.text
    d = unwrap(r)
    assert d["facts"]["hostname"] == "fake-host" and len(d["containers"]) == 2

    r = await enc.post(f"{API}/containers/{WEB}/actions", json=wrap({"action": "stop"}))
    assert unwrap(r) == {"state": "exited"}
    r = await enc.get(f"{API}/containers/{WEB}/logs")
    assert "server started" not in r.text and "server started" in "\n".join(unwrap(r)["lines"])


async def test_errors_are_encrypted_too(enc, fake, creds):
    r = await enc.post(f"{API}/auth/login", json=wrap({**creds, "host_key_fingerprint": None}))
    assert r.status_code == 409 and fake.fingerprint not in r.text
    assert unwrap(r)["error"]["details"]["fingerprint"] == fake.fingerprint
    r = await enc.get(f"{API}/overview")
    assert r.status_code == 401 and unwrap(r)["error"]["code"] == "not_authenticated"


async def test_empty_body_posts_and_204_still_work(enc, fake, creds):
    await login(enc, fake, creds)
    r = await enc.post(f"{API}/auth/logout")
    assert r.status_code == 204 and r.content == b""


async def test_healthz_is_not_wrapped(enc):
    r = await enc.get("/healthz")
    assert r.json() == {"status": "ok"}


def test_production_requires_a_key():
    from app.core.config import Settings

    with pytest.raises(ValueError):
        Settings(app_env="production", public_url="https://x.example", cookie_secure=True)
    Settings(app_env="production", public_url="https://x.example", encryption_key="k" * 20)
