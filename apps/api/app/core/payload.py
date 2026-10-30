"""Encrypted API payloads.

With ENCRYPTION_KEY set, every body the API receives and every body it returns under /api/v1 is
wrapped as {"d": base64url(nonce || AES-256-GCM ciphertext)}, so the browser's network tab shows
ciphertext instead of credentials or container data. The AES key is SHA-256(ENCRYPTION_KEY).

This is obfuscation on top of TLS, not a replacement for it: the web app needs the same key to
read the data, so anyone who can load the app can get it.
"""

import base64
import hashlib
import json
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

REQ_AAD, RES_AAD = b"zent-req-v1", b"zent-res-v1"
HEADER = b"x-zent-enc"
_SAFE = {"GET", "HEAD", "OPTIONS"}


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


class PayloadCrypto:
    def __init__(self, secret: str):
        self._aes = AESGCM(hashlib.sha256(secret.encode()).digest())

    def encrypt(self, data: bytes, aad: bytes) -> str:
        nonce = os.urandom(12)
        return _b64(nonce + self._aes.encrypt(nonce, data, aad))

    def decrypt(self, token: str, aad: bytes) -> bytes:
        raw = _unb64(token)
        if len(raw) < 28:
            raise ValueError("short payload")
        try:
            return self._aes.decrypt(raw[:12], raw[12:], aad)
        except InvalidTag:
            raise ValueError("bad payload") from None


class EncryptedPayloadMiddleware:
    """Pure ASGI: decrypts request bodies and encrypts response bodies for /api/v1."""

    def __init__(self, app, secret: str):
        self.app, self.crypto = app, PayloadCrypto(secret)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/api/v1"):
            return await self.app(scope, receive, send)

        if scope["method"] not in _SAFE:
            body = b""
            while True:
                msg = await receive()
                body += msg.get("body", b"")
                if not msg.get("more_body"):
                    break
            if body.strip():
                try:
                    body = self.crypto.decrypt(json.loads(body)["d"], REQ_AAD)
                except (ValueError, KeyError, TypeError):
                    return await self._reject(send)
            scope = dict(scope)
            scope["headers"] = [(k, v) for k, v in scope["headers"] if k != b"content-length"] + [
                (b"content-length", str(len(body)).encode())]
            sent = False

            async def receive():  # noqa: F811 - replays the decrypted body
                nonlocal sent
                if sent:
                    return {"type": "http.disconnect"}
                sent = True
                return {"type": "http.request", "body": body, "more_body": False}

        start: dict = {}
        chunks: list[bytes] = []

        async def capture(msg):
            if msg["type"] == "http.response.start":
                start.update(msg)
            elif msg["type"] == "http.response.body":
                chunks.append(msg.get("body", b""))
                if not msg.get("more_body"):
                    await self._flush(send, start, b"".join(chunks))

        await self.app(scope, receive, capture)

    async def _flush(self, send, start, body: bytes):
        headers = start["headers"]
        if body:
            token = self.crypto.encrypt(body, RES_AAD)
            body = json.dumps({"d": token}).encode()
            headers = [(k, v) for k, v in headers if k not in (b"content-length", b"content-type")] + [
                (b"content-type", b"application/json"), (b"content-length", str(len(body)).encode()),
                (HEADER, b"1")]
        await send({**start, "headers": headers})
        await send({"type": "http.response.body", "body": body})

    async def _reject(self, send):
        body = json.dumps({"error": {"code": "bad_payload",
                                     "message": "Request body must be encrypted"}}).encode()
        await send({"type": "http.response.start", "status": 400, "headers": [
            (b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})
