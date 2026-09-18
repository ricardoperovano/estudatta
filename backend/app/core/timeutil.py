"""Utilidades de tempo: UTC no banco, fuso IANA no planejamento."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def utcnow() -> datetime:
    return datetime.now(UTC)


def ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def valid_timezone(name: str) -> bool:
    try:
        ZoneInfo(name)
        return True
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        return False


def local_date(dt: datetime, tz: str) -> date:
    return ensure_utc(dt).astimezone(ZoneInfo(tz)).date()


def local_midnight_utc(d: date, tz: str) -> datetime:
    """Instante UTC em que o dia local `d` começa no fuso `tz` (respeita DST)."""
    return datetime.combine(d, time.min, tzinfo=ZoneInfo(tz)).astimezone(UTC)


def local_datetime_to_utc(d: date, t: time, tz: str) -> datetime:
    return datetime.combine(d, t, tzinfo=ZoneInfo(tz)).astimezone(UTC)


def today_in(tz: str) -> date:
    return utcnow().astimezone(ZoneInfo(tz)).date()


def daterange(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def weekday_key(d: date) -> str:
    """0 = segunda … 6 = domingo (ISO), como chave de string para JSON."""
    return str(d.weekday())
