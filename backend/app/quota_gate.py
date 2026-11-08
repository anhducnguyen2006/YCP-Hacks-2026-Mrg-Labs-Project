"""Shared, expiring Gemini dispatch gate; contains no credentials or label data."""
from redis import Redis

from app.config import get_settings

GATE_KEY = "mrg:gemini:dispatch-hold"
HOLD_SECONDS = {"quota": 3600, "unavailable": 120}


def get_hold(redis: Redis) -> dict[str, int | str] | None:
    value = redis.get(GATE_KEY)
    if not value:
        return None
    reason = value.decode() if isinstance(value, bytes) else str(value)
    if reason not in HOLD_SECONDS:
        return None
    return {"reason": reason, "seconds_remaining": max(redis.ttl(GATE_KEY), 0)}


def set_hold(redis: Redis, reason: str) -> None:
    if reason not in HOLD_SECONDS:
        raise ValueError("Unsupported Gemini hold reason")
    # Every 429/503 renews the shared hold. No automatic re-enqueue.
    redis.set(GATE_KEY, reason, ex=HOLD_SECONDS[reason])


def clear_hold(redis: Redis) -> None:
    redis.delete(GATE_KEY)


def connection() -> Redis:
    return Redis.from_url(get_settings().redis_url)
