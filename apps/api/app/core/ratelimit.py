"""In-process sliding-window rate limiter (ZENT keeps no external state)."""

import time
from collections import defaultdict, deque

from app.core.errors import TooManyRequests


class MemoryLimiter:
    def __init__(self):
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    async def hit(self, key: str, limit: int, window: int) -> None:
        now = time.monotonic()
        q = self._hits[key]
        while q and q[0] <= now - window:
            q.popleft()
        if len(q) >= limit:
            raise TooManyRequests(
                "Too many requests", headers={"Retry-After": str(max(1, int(window - (now - q[0]))))})
        q.append(now)
        if len(self._hits) > 10_000:  # bound memory against key-spraying
            for k in [k for k, v in self._hits.items() if not v or v[-1] <= now - window]:
                del self._hits[k]

    def reset(self) -> None:
        self._hits.clear()


_limiter = MemoryLimiter()


def get_limiter() -> MemoryLimiter:
    return _limiter
