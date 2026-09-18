from datetime import UTC, date, datetime

from app.domain.intervals import TzPeriod, merged_focus_seconds, split_by_local_date

SP = "America/Sao_Paulo"


def test_session_crossing_midnight_splits_without_duplicating_seconds():
    # 23:30 → 00:30 em São Paulo (UTC-3): 02:30Z → 03:30Z
    start = datetime(2026, 9, 18, 2, 30, tzinfo=UTC)
    end = datetime(2026, 9, 18, 3, 30, tzinfo=UTC)
    out = split_by_local_date([(start, end)], [], SP)
    assert out == {date(2026, 9, 17): 1800, date(2026, 9, 18): 1800}
    assert sum(out.values()) == 3600


def test_dst_transition_uses_real_local_midnight():
    # America/Santiago: 2026-09-06 00:00 → 01:00 (início de DST no Chile).
    # Sessão de 23:00 (5 set) até 02:00 (6 set) local = 3h de relógio? Não: com o salto, 2h reais.
    tz = "America/Santiago"
    start = datetime(2026, 9, 6, 3, 0, tzinfo=UTC)  # 23:00 local (UTC-4)
    end = datetime(2026, 9, 6, 5, 0, tzinfo=UTC)  # 02:00 local (UTC-3 após o salto)
    out = split_by_local_date([(start, end)], [], tz)
    assert sum(out.values()) == 7200
    assert out[date(2026, 9, 5)] == 3600
    assert out[date(2026, 9, 6)] == 3600


def test_timezone_change_is_versioned_and_history_stays():
    history = [TzPeriod(date(2026, 1, 1), SP), TzPeriod(date(2026, 9, 18), "Europe/Lisbon")]
    old = (
        datetime(2026, 9, 17, 23, 0, tzinfo=UTC),
        datetime(2026, 9, 17, 23, 30, tzinfo=UTC),
    )  # 20:00 SP em 17/09
    new = (
        datetime(2026, 9, 18, 22, 0, tzinfo=UTC),
        datetime(2026, 9, 18, 22, 30, tzinfo=UTC),
    )  # 23:00 Lisboa em 18/09
    out = split_by_local_date([old, new], history, SP)
    assert out == {date(2026, 9, 17): 1800, date(2026, 9, 18): 1800}


def test_merged_focus_seconds_ignores_overlap():
    a = (datetime(2026, 9, 18, 10, 0, tzinfo=UTC), datetime(2026, 9, 18, 10, 30, tzinfo=UTC))
    b = (datetime(2026, 9, 18, 10, 15, tzinfo=UTC), datetime(2026, 9, 18, 10, 45, tzinfo=UTC))
    assert merged_focus_seconds([a, b]) == 2700
