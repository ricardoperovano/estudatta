"""Rate limit simples por janela fixa: Redis quando disponível, memória como fallback."""

from __future__ import annotations

import threading
import time

from app.core.config import settings


class _MemoryLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._buckets: dict[str, tuple[int, float]] = {}

    def allow(self, key: str, limit: int, window: int) -> bool:
        now = time.time()
        with self._lock:
            count, reset = self._buckets.get(key, (0, now + window))
            if now > reset:
                count, reset = 0, now + window
            count += 1
            self._buckets[key] = (count, reset)
            if len(self._buckets) > 50_000:
                self._buckets = {k: v for k, v in self._buckets.items() if v[1] > now}
            return count <= limit


class _RedisLimiter:
    def __init__(self, url: str) -> None:
        import redis

        self._r = redis.Redis.from_url(url, socket_connect_timeout=0.5, socket_timeout=0.5)
        self._fallback = _MemoryLimiter()

    def allow(self, key: str, limit: int, window: int) -> bool:
        try:
            pipe = self._r.pipeline()
            k = f"rl:{key}"
            pipe.incr(k)
            pipe.expire(k, window, nx=True)
            count, _ = pipe.execute()
            return int(count) <= limit
        except Exception:
            return self._fallback.allow(key, limit, window)


def _build():
    if settings.APP_ENV == "test":
        return _MemoryLimiter()
    try:
        return _RedisLimiter(settings.REDIS_URL)
    except Exception:
        return _MemoryLimiter()


limiter = _build()
