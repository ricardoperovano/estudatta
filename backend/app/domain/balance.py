"""Motor de metas e saldo — lógica de domínio pura (sem UI, IA ou scheduler).

Grandezas por objetivo e dia civil no fuso de planejamento (em segundos inteiros):

- M_d  target        meta base do dia; 0 em descanso, pausa ou fora do período ativo
- S_d  logged        tempo válido registrado (sem pausas, sem contagem duplicada)
- B_anterior carry_in   pendência ao final do dia anterior
- F_d  missing_today = max(0, M_d - S_d)
- P_d  pending_prior = max(0, B_anterior - max(0, S_d - M_d))
- R_d  remaining     = F_d + P_d
- B_d  carry_out     = max(0, B_anterior + M_d - S_d) no modo acumulativo (menos perdão explícito)

O tempo de hoje atende primeiro à meta de hoje e depois à pendência anterior, dos dias
mais antigos para os mais novos. Excedente após quitar tudo é "tempo extra" e não gera
crédito para dias futuros (v1).

Perdão de pendência entra como ajuste explícito aplicado ao fechamento do dia indicado.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Literal

RecoveryPolicy = Literal["accumulate", "accumulate_suggest", "none"]


@dataclass(frozen=True)
class RuleSpec:
    effective_from: date
    minutes_by_weekday: dict[str, int]  # "0"=segunda … "6"=domingo
    daily_limit_minutes: int = 120
    version: int = 1

    def target_seconds(self, d: date) -> int:
        return max(0, int(self.minutes_by_weekday.get(str(d.weekday()), 0))) * 60


@dataclass(frozen=True)
class PauseSpec:
    start: date
    end: date

    def covers(self, d: date) -> bool:
        return self.start <= d <= self.end


@dataclass(frozen=True)
class AdjustmentSpec:
    applies_on: date
    seconds: int  # positivo reduz pendência


@dataclass
class DayBalance:
    local_date: date
    target: int
    logged: int
    carry_in: int
    missing_today: int
    pending_prior: int
    remaining_total: int
    carry_out: int
    recovered: int
    extra: int
    forgiven: int
    is_rest: bool
    is_paused: bool
    in_range: bool
    goal_met: bool
    rule_version: int
    daily_limit: int
    recovered_from: list[tuple[date, int]] = field(default_factory=list)

    @property
    def deficit(self) -> int:
        """Quanto ficou faltando da meta deste dia (histórico, mesmo no modo sem acumulação)."""
        return max(0, self.target - self.logged)


@dataclass(frozen=True)
class TargetInfo:
    seconds: int
    is_rest: bool
    is_paused: bool
    in_range: bool
    version: int
    daily_limit_seconds: int


def rule_for(d: date, rules: Iterable[RuleSpec]) -> RuleSpec | None:
    """Regra vigente no dia `d`: a de maior effective_from ≤ d."""
    chosen: RuleSpec | None = None
    for r in rules:
        if r.effective_from <= d and (chosen is None or r.effective_from >= chosen.effective_from):
            chosen = r
    return chosen


def target_for(
    d: date,
    rules: Iterable[RuleSpec],
    pauses: Iterable[PauseSpec],
    start_date: date,
    end_date: date | None,
) -> TargetInfo:
    in_range = d >= start_date and (end_date is None or d <= end_date)
    rule = rule_for(d, rules)
    limit = (rule.daily_limit_minutes if rule else 120) * 60
    version = rule.version if rule else 0
    if not in_range or rule is None:
        return TargetInfo(0, False, False, in_range, version, limit)
    if any(p.covers(d) for p in pauses):
        return TargetInfo(0, False, True, True, version, limit)
    seconds = rule.target_seconds(d)
    return TargetInfo(seconds, seconds == 0, False, True, version, limit)


def compute_balances(
    days: Iterable[date],
    *,
    rules: Iterable[RuleSpec],
    pauses: Iterable[PauseSpec],
    logged_by_date: dict[date, int],
    adjustments: Iterable[AdjustmentSpec],
    policy: RecoveryPolicy,
    start_date: date,
    end_date: date | None,
    open_day: date | None = None,
) -> list[DayBalance]:
    """Reproduz o saldo dia a dia, de forma determinística, a partir de regras,
    sessões aceitas e ajustes explícitos. `days` deve ser crescente e contíguo.

    `open_day` (normalmente "hoje") é calculado mas não é considerado encerrado:
    o carry_out é projetado como se o dia fechasse agora, para leitura.
    """
    rules = list(rules)
    pauses = list(pauses)
    adj_by_date: dict[date, int] = {}
    for a in adjustments:
        adj_by_date[a.applies_on] = adj_by_date.get(a.applies_on, 0) + max(0, a.seconds)

    accumulate = policy != "none"
    queue: deque[list] = deque()  # [date, deficit_remaining] — dias antigos primeiro
    carry = 0
    out: list[DayBalance] = []

    for d in days:
        t = target_for(d, rules, pauses, start_date, end_date)
        target = t.seconds
        logged = max(0, int(logged_by_date.get(d, 0)))
        carry_in = carry if accumulate else 0

        missing_today = max(0, target - logged)
        surplus = max(0, logged - target)
        recovered = min(surplus, carry_in) if accumulate else 0
        pending_prior = max(0, carry_in - surplus) if accumulate else 0
        remaining_total = missing_today + pending_prior
        extra = max(0, surplus - carry_in) if accumulate else surplus

        recovered_from: list[tuple[date, int]] = []
        if accumulate and recovered > 0:
            to_apply = recovered
            while to_apply > 0 and queue:
                item = queue[0]
                take = min(item[1], to_apply)
                item[1] -= take
                to_apply -= take
                recovered_from.append((item[0], take))
                if item[1] == 0:
                    queue.popleft()

        carry_out = max(0, carry_in + target - logged) if accumulate else 0
        if accumulate and missing_today > 0:
            queue.append([d, missing_today])

        forgiven = 0
        if accumulate:
            forgive = adj_by_date.get(d, 0)
            if forgive > 0:
                forgiven = min(forgive, carry_out)
                carry_out -= forgiven
                to_forgive = forgiven
                while to_forgive > 0 and queue:
                    item = queue[0]
                    take = min(item[1], to_forgive)
                    item[1] -= take
                    to_forgive -= take
                    if item[1] == 0:
                        queue.popleft()

        goal_met = target > 0 and logged >= target
        out.append(
            DayBalance(
                local_date=d,
                target=target,
                logged=logged,
                carry_in=carry_in,
                missing_today=missing_today,
                pending_prior=pending_prior,
                remaining_total=remaining_total,
                carry_out=carry_out,
                recovered=recovered,
                extra=extra,
                forgiven=forgiven,
                is_rest=t.is_rest,
                is_paused=t.is_paused,
                in_range=t.in_range,
                goal_met=goal_met,
                rule_version=t.version,
                daily_limit=t.daily_limit_seconds,
                recovered_from=recovered_from,
            )
        )
        if d == open_day:
            # O dia em aberto não altera o carry para dias seguintes (não encerrado)
            break
        carry = carry_out
    return out


def day_span(start: date, end: date) -> list[date]:
    if end < start:
        return []
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


@dataclass(frozen=True)
class TodaySummary:
    local_date: date
    target: int
    logged: int
    missing_today: int
    pending_prior: int
    remaining_total: int
    suggested_recovery: int
    extra: int
    is_rest: bool
    is_paused: bool
    in_range: bool
    goal_met: bool
    daily_limit: int
    pending_after_plan: int

    @property
    def next_step_seconds(self) -> int:
        return self.missing_today + self.suggested_recovery


def summarize_today(day: DayBalance, suggested_recovery: int | None) -> TodaySummary:
    """Resume o dia em aberto. `suggested_recovery` é a alocação do plano de recuperação
    para hoje (ou None quando não há plano); nunca ultrapassa a pendência anterior restante."""
    if suggested_recovery is None:
        suggested = 0
    else:
        suggested = max(0, min(suggested_recovery, day.pending_prior))
    pending_after = max(0, day.pending_prior - suggested)
    return TodaySummary(
        local_date=day.local_date,
        target=day.target,
        logged=day.logged,
        missing_today=day.missing_today,
        pending_prior=day.pending_prior,
        remaining_total=day.remaining_total,
        suggested_recovery=suggested,
        extra=day.extra,
        is_rest=day.is_rest,
        is_paused=day.is_paused,
        in_range=day.in_range,
        goal_met=day.goal_met,
        daily_limit=day.daily_limit,
        pending_after_plan=pending_after,
    )


def streak(days: list[DayBalance], today: date) -> tuple[int, int]:
    """(sequência atual, melhor sequência) de dias planejados com meta cumprida.

    Dias de descanso/pausa não aumentam nem interrompem. Dia planejado encerrado sem
    cumprir meta interrompe. O dia atual em aberto não interrompe antecipadamente,
    mas conta se a meta já foi cumprida.
    """
    current = 0
    best = 0
    for day in days:
        if day.local_date > today:
            break
        if day.target == 0:
            continue
        if day.goal_met:
            current += 1
            best = max(best, current)
        elif day.local_date < today:
            current = 0
        # hoje em aberto e não cumprido: não interrompe
    return current, best
