"""Distribuição determinística de pendência e de tarefas.

Regras:
- nunca prometer recuperar mais do que cabe na capacidade extra disponível;
- distribuição uniforme em minutos inteiros, remanescente para os dias mais próximos;
- blocos fixados pelo usuário são preservados; nada se sobrepõe automaticamente.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


@dataclass(frozen=True)
class DayCapacity:
    local_date: date
    target_seconds: int
    daily_limit_seconds: int
    committed_seconds: int  # tarefas planejadas do dia (estimativa) + outros compromissos
    is_active: bool  # dia com meta > 0 e não pausado

    @property
    def extra_capacity(self) -> int:
        return max(0, self.daily_limit_seconds - self.target_seconds - self.committed_seconds)


@dataclass
class Distribution:
    allocations: dict[date, int] = field(default_factory=dict)
    unallocated: int = 0
    exceeds_capacity_on: list[date] = field(default_factory=list)

    @property
    def allocated(self) -> int:
        return sum(self.allocations.values())


MINUTE = 60


def _round_up_minute(seconds: int) -> int:
    return ((seconds + MINUTE - 1) // MINUTE) * MINUTE


def distribute_pending(
    pending_seconds: int,
    days: list[DayCapacity],
    *,
    horizon_days: int | None = None,
    until: date | None = None,
    include_rest_days: bool = False,
) -> Distribution:
    """Distribui `pending_seconds` pelos próximos dias elegíveis.

    Elegível: dia ativo (ou de descanso, se `include_rest_days`) com capacidade extra.
    `horizon_days` limita a N dias elegíveis; `until` limita pela data.
    """
    dist = Distribution()
    if pending_seconds <= 0:
        return dist
    eligible: list[DayCapacity] = []
    for d in sorted(days, key=lambda x: x.local_date):
        if until is not None and d.local_date > until:
            break
        if not (d.is_active or include_rest_days):
            continue
        if d.extra_capacity <= 0:
            continue
        eligible.append(d)
        if horizon_days is not None and len(eligible) >= horizon_days:
            break
    if not eligible:
        dist.unallocated = pending_seconds
        return dist

    n = len(eligible)
    per_day = _round_up_minute((pending_seconds + n - 1) // n)
    remaining = pending_seconds
    for d in eligible:
        if remaining <= 0:
            break
        take = min(per_day, d.extra_capacity, remaining)
        if take > 0:
            dist.allocations[d.local_date] = take
            remaining -= take
    # segunda passada: preencher capacidade restante em ordem cronológica
    if remaining > 0:
        for d in eligible:
            if remaining <= 0:
                break
            used = dist.allocations.get(d.local_date, 0)
            room = d.extra_capacity - used
            take = min(room, remaining)
            if take > 0:
                dist.allocations[d.local_date] = used + take
                remaining -= take
    dist.unallocated = remaining
    return dist


def recover_all_today(pending_seconds: int, today: DayCapacity) -> Distribution:
    dist = Distribution()
    if pending_seconds <= 0:
        return dist
    dist.allocations[today.local_date] = pending_seconds
    if pending_seconds > today.extra_capacity:
        dist.exceeds_capacity_on.append(today.local_date)
    return dist


@dataclass(frozen=True)
class TaskToPlace:
    task_id: str
    estimated_seconds: int
    priority: int  # 1 alta … 3 baixa
    due_date: date | None
    order: int  # desempate estável


@dataclass
class AutoPlanResult:
    placements: dict[str, date] = field(default_factory=dict)
    unplaced: list[str] = field(default_factory=list)
    overload_by_date: dict[date, int] = field(default_factory=dict)


def auto_place_tasks(tasks: list[TaskToPlace], days: list[DayCapacity]) -> AutoPlanResult:
    """Distribui tarefas de conteúdo dentro da disponibilidade dos dias ativos.

    Determinístico: ordena por prazo, prioridade e ordem original; preenche cada dia
    até a meta base (a duração estimada ocupa a disponibilidade; não cria obrigação
    extra). Tarefas que não cabem antes do prazo ficam em `unplaced` para decisão do usuário.
    """
    result = AutoPlanResult()
    ordered = sorted(tasks, key=lambda t: (t.due_date or date.max, t.priority, t.order))
    active_days = [d for d in sorted(days, key=lambda x: x.local_date) if d.is_active]
    room: dict[date, int] = {
        d.local_date: max(0, d.target_seconds - d.committed_seconds) for d in active_days
    }
    for t in ordered:
        placed = False
        for d in active_days:
            if t.due_date is not None and d.local_date > t.due_date:
                break
            if room[d.local_date] >= t.estimated_seconds:
                room[d.local_date] -= t.estimated_seconds
                result.placements[t.task_id] = d.local_date
                placed = True
                break
        if not placed:
            result.unplaced.append(t.task_id)
    return result


@dataclass(frozen=True)
class TimedTaskToPlace(TaskToPlace):
    """Tarefa com horário opcional (segundos desde a meia-noite local)."""

    start_seconds: int | None = None


def _overlaps(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    return a_start < b_end and b_start < a_end


def auto_place_tasks_timed(
    tasks: list[TimedTaskToPlace],
    days: list[DayCapacity],
    busy: dict[date, list[tuple[int, int]]] | None = None,
) -> AutoPlanResult:
    """Como `auto_place_tasks`, mas respeita horários: uma tarefa com `start_seconds` só
    entra em um dia onde seu intervalo [início, início + duração) não cruza nenhum bloco
    fixo de `busy` nem outra tarefa já colocada com horário. Determinístico: mesma
    entrada, mesma saída."""
    result = AutoPlanResult()
    ordered = sorted(tasks, key=lambda t: (t.due_date or date.max, t.priority, t.order))
    active_days = [d for d in sorted(days, key=lambda x: x.local_date) if d.is_active]
    room: dict[date, int] = {
        d.local_date: max(0, d.target_seconds - d.committed_seconds) for d in active_days
    }
    slots: dict[date, list[tuple[int, int]]] = {
        d.local_date: list((busy or {}).get(d.local_date, [])) for d in active_days
    }
    for t in ordered:
        placed = False
        for d in active_days:
            if t.due_date is not None and d.local_date > t.due_date:
                break
            if room[d.local_date] < t.estimated_seconds:
                continue
            if t.start_seconds is not None:
                s, e = t.start_seconds, t.start_seconds + t.estimated_seconds
                if any(_overlaps(s, e, bs, be) for bs, be in slots[d.local_date]):
                    continue
                slots[d.local_date].append((s, e))
            room[d.local_date] -= t.estimated_seconds
            result.placements[t.task_id] = d.local_date
            placed = True
            break
        if not placed:
            result.unplaced.append(t.task_id)
    return result
