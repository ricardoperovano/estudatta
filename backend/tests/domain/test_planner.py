from datetime import date, timedelta

from app.domain.planner import (
    DayCapacity,
    TaskToPlace,
    auto_place_tasks,
    distribute_pending,
    recover_all_today,
)

D0 = date(2026, 9, 17)


def caps(n=7, target=3600, limit=7200, committed=0, rest=(5, 6)):
    out = []
    for i in range(n):
        d = D0 + timedelta(days=i)
        is_rest = d.weekday() in rest
        out.append(DayCapacity(d, 0 if is_rest else target, limit, committed, not is_rest))
    return out


def test_120_over_four_days_is_30_per_day():
    dist = distribute_pending(7200, caps(), horizon_days=4)
    assert list(dist.allocations.values()) == [1800, 1800, 1800, 1800]
    assert dist.unallocated == 0


def test_never_exceeds_capacity_and_reports_unallocated():
    days = caps(n=3, target=3600, limit=4200, rest=())  # 10 min extra por dia
    dist = distribute_pending(7200, days)
    assert all(v <= 600 for v in dist.allocations.values())
    assert dist.allocated == 1800
    assert dist.unallocated == 5400


def test_until_date_limits_horizon():
    dist = distribute_pending(3600, caps(), until=D0 + timedelta(days=1))
    assert set(dist.allocations) == {D0, D0 + timedelta(days=1)}
    assert dist.allocated == 3600


def test_recover_all_today_flags_capacity():
    today = DayCapacity(D0, 3600, 5400, 0, True)  # 30 min extras
    dist = recover_all_today(3600, today)
    assert dist.allocations == {D0: 3600}
    assert dist.exceeds_capacity_on == [D0]


def test_auto_place_tasks_is_deterministic_and_respects_due_dates():
    days = caps(n=5, rest=())
    tasks = [
        TaskToPlace("a", 1800, 2, D0 + timedelta(days=1), 0),
        TaskToPlace("b", 1800, 1, None, 1),
        TaskToPlace("c", 3600, 2, D0, 2),
        TaskToPlace("d", 7200, 2, D0, 3),  # não cabe em um dia de 60 min
    ]
    res = auto_place_tasks(tasks, days)
    assert res.placements["c"] == D0
    assert res.placements["a"] == D0 + timedelta(days=1)
    assert res.placements["b"] == D0 + timedelta(days=1)
    assert res.unplaced == ["d"]
