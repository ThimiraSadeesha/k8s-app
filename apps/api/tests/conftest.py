import os

os.environ.update({"APP_ENV": "test", "COOKIE_SECURE": "true", "SSH_ALLOW_LOOPBACK": "true",
                   "LOGIN_MAX_ATTEMPTS": "50"})

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.core import ratelimit  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services import sessions  # noqa: E402
from tests.fakessh import FakeSsh  # noqa: E402


@pytest_asyncio.fixture
async def fake():
    s = FakeSsh()
    await s.start()
    yield s
    await s.stop()


@pytest_asyncio.fixture
async def client(fake):
    get_settings.cache_clear()
    ratelimit.get_limiter().reset()
    sessions.close_all()
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://test",
                           headers={"Origin": "http://localhost:3000"}) as c:
        yield c
    sessions.close_all()


@pytest.fixture
def creds(fake):
    return {"host": "127.0.0.1", "port": fake.port, "username": fake.user, "password": fake.password}


@pytest_asyncio.fixture
async def authed(client, fake, creds):
    r = await client.post("/api/v1/auth/login", json={**creds, "host_key_fingerprint": fake.fingerprint})
    assert r.status_code == 200, r.text
    return client
