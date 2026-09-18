"""Divisão de intervalos de sessão por dia local, respeitando fuso versionado."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class TzPeriod:
    effective_from: date
    timezone: str


def tz_at(dt: datetime, history: list[TzPeriod], default_tz: str) -> str:
    """Fuso vigente no instante `dt` (UTC), com vigência futura.

    Um novo período com `effective_from = D` passa a valer a partir da meia-noite
    local de D medida no fuso *anterior*: o dia em curso termina no fuso antigo e o
    histórico nunca é movido para outro dia. Sem histórico, usa o fuso padrão.
    """
    if not history:
        return default_tz
    ordered = sorted(history, key=lambda p: p.effective_from)
    current = ordered[0].timezone
    for prev, nxt in zip(ordered, ordered[1:], strict=False):
        boundary = datetime.combine(
            nxt.effective_from, datetime.min.time(), tzinfo=ZoneInfo(prev.timezone)
        ).astimezone(UTC)
        if dt.astimezone(UTC) >= boundary:
            current = nxt.timezone
        else:
            break
    return current


def truncate_seconds(dt: datetime) -> datetime:
    return dt.replace(microsecond=0)


def split_by_local_date(
    intervals: list[tuple[datetime, datetime]],
    history: list[TzPeriod],
    default_tz: str,
) -> dict[date, int]:
    """Atribui os segundos de cada intervalo [start, end) aos dias locais correspondentes.

    Um intervalo que atravessa a meia-noite é dividido no instante exato da meia-noite
    local (que respeita transições de horário de verão). Segundos não são duplicados:
    a soma das alocações é igual à duração total em segundos inteiros.
    """
    result: dict[date, int] = {}
    for start, end in intervals:
        s = truncate_seconds(start.astimezone(UTC))
        e = truncate_seconds(end.astimezone(UTC))
        if e <= s:
            continue
        cur = s
        while cur < e:
            tz = tz_at(cur, history, default_tz)
            zone = ZoneInfo(tz)
            local_day = cur.astimezone(zone).date()
            next_midnight = datetime.combine(
                local_day + timedelta(days=1), datetime.min.time(), tzinfo=zone
            ).astimezone(UTC)
            seg_end = min(e, next_midnight)
            secs = int((seg_end - cur).total_seconds())
            if secs > 0:
                result[local_day] = result.get(local_day, 0) + secs
            cur = seg_end
    return result


def merged_focus_seconds(intervals: list[tuple[datetime, datetime]]) -> int:
    """Duração total de intervalos de foco após fundir sobreposições (sem contar duas vezes)."""
    if not intervals:
        return 0
    ordered = sorted((truncate_seconds(a), truncate_seconds(b)) for a, b in intervals if b > a)
    total = 0
    cur_s, cur_e = ordered[0]
    for s, e in ordered[1:]:
        if s <= cur_e:
            cur_e = max(cur_e, e)
        else:
            total += int((cur_e - cur_s).total_seconds())
            cur_s, cur_e = s, e
    total += int((cur_e - cur_s).total_seconds())
    return total


def overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return a_start < b_end and b_start < a_end
