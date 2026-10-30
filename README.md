# ZENT

Log in to a server with its SSH login, watch its usage and manage its Docker containers.
**ZENT stores nothing**: no database, no user accounts, no saved servers. Your SSH login lives in the
API's memory for the session only and disappears on sign-out, after 30 idle minutes (8 hours at most),
or when the API restarts.

## What it does

- **Sign in** with host, port, username and password. The server's host key fingerprint is shown first and
  your password is only sent once you confirm it matches.
- **Monitor** CPU, memory, disk, network, uptime and per-container CPU/memory. Live graphs are kept in the
  browser tab only.
- **Manage containers**: view, start, stop, restart, pause/resume, remove, and read logs (secrets redacted).

The SSH user needs access to Docker (member of the `docker` group, or root).

## Develop

```bash
cd apps/api && python -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/pytest                                   # runs against a fake SSH server, no external services
SSH_ALLOW_LOOPBACK=true .venv/bin/uvicorn app.main:app --port 8000   # API (loopback targets are blocked by default)
cd ../ui && npm ci && npm run dev                  # UI on http://localhost:3000, proxies /api/v1 to :8000
```

`python -m tests.fakessh` starts a fake Docker host on `127.0.0.1:2222` (user `deploy`, password
`s3cret-pass`) for trying the UI without a real server.

## Deploy

```bash
PUBLIC_URL=https://zent.example.com CORS_ORIGINS=https://zent.example.com docker compose up -d --build
```

Put a TLS-terminating reverse proxy in front (production requires `https://` and Secure cookies) and set
`TRUSTED_PROXY_COUNT` to the number of proxies in front of the API. Settings: see
`apps/api/app/core/config.py`.

## Encrypted API traffic

With `ENCRYPTION_KEY` set (required in production, 16+ characters), every request and response body under
`/api/v1` is AES-256-GCM encrypted as `{"d": "..."}`, so the browser's network tab shows ciphertext, not
credentials or container data. Set the same value on the `api` and `ui` services. The browser fetches the key
from the UI server at runtime (`/zent-key`). **This is obfuscation on top of HTTPS, not a replacement for it:**
the web app needs the key to work, so anyone who can open the app can obtain it. URLs (container ids) and
the session cookie are not encrypted. Leave `ENCRYPTION_KEY` unset in development to use plain JSON.

## Security notes

- Targets on loopback, link-local (cloud metadata) and unspecified addresses are refused.
- Only fixed commands run on the server; container ids are validated and shell-quoted.
- The session cookie is `HttpOnly`, `Secure` and `SameSite=Strict`; cross-origin writes are rejected.
- Logins are rate limited per client IP.
