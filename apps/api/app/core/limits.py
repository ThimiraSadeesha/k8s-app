"""Pure-ASGI request body size limit (works for chunked uploads, unlike a Content-Length check)."""

import json


class BodyLimitMiddleware:
    def __init__(self, app, max_bytes: int):
        self.app, self.max_bytes = app, max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        declared = dict(scope["headers"]).get(b"content-length")
        if declared and declared.isdigit() and int(declared) > self.max_bytes:
            return await self._reject(send)

        seen = 0
        responded = False

        async def limited_receive():
            nonlocal seen
            msg = await receive()
            if msg["type"] == "http.request":
                seen += len(msg.get("body", b""))
                if seen > self.max_bytes:
                    raise _TooLarge
            return msg

        async def tracking_send(msg):
            nonlocal responded
            responded = responded or msg["type"] == "http.response.start"
            await send(msg)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except _TooLarge:
            if not responded:
                await self._reject(send)

    @staticmethod
    async def _reject(send):
        body = json.dumps({"error": {"code": "payload_too_large", "message": "Request body too large"}})
        await send({"type": "http.response.start", "status": 413,
                    "headers": [(b"content-type", b"application/json"),
                                (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body.encode()})


class _TooLarge(Exception):
    pass
