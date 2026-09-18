"""Casos numéricos obrigatórios do motor de saldo (seção 7.3 do escopo)."""

from datetime import date, timedelta

import pytest

from app.domain.balance import (
    AdjustmentSpec,
    PauseSpec,
    RuleSpec,
    compute_balances,
    day_span,
    streak,
    summarize_today,
)

MON = date(2026, 9, 14)  # segunda-feira
WEEKDAYS = {"0": 60, "1": 60, "2": 60, "3": 60, "4": 60, "5": 0, "6": 0}
RULE = RuleSpec(effective_from=MON, minutes_by_weekday=WEEKDAYS, daily_limit_minutes=120)


def run(
    logged: dict[date, int],
    *,
    days=None,
    rules=(RULE,),
    pauses=(),
    adjustments=(),
    policy="accumulate",
    start=MON,
    end=None,
    open_day=None,
):
    days = days or day_span(MON, MON + timedelta(days=6))
    return compute_balances(
        days,
        rules=rules,
        pauses=pauses,
        logged_by_date=logged,
        adjustments=adjustments,
        policy=policy,
        start_date=start,
        end_date=end,
        open_day=open_day,
    )


def test_monday_without_study_closes_with_60_pending():
    out = run({})
    mon = out[0]
    assert mon.target == 3600 and mon.logged == 0
    assert mon.carry_out == 3600


def test_tuesday_starts_with_60_target_and_60_prior_total_120():
    out = run({})
    tue = out[1]
    assert tue.target == 3600
    assert tue.carry_in == 3600
    assert tue.pending_prior == 3600
    assert tue.remaining_total == 7200


def test_tuesday_logging_90_recovers_30_leaving_30():
    tue = MON + timedelta(days=1)
    out = run({tue: 90 * 60})
    t = out[1]
    assert t.goal_met
    assert t.recovered == 1800
    assert t.pending_prior == 1800
    assert t.carry_out == 1800
    assert t.recovered_from == [(MON, 1800)]


def test_wednesday_with_30_prior_and_90_logged_clears_pending():
    tue = MON + timedelta(days=1)
    wed = MON + timedelta(days=2)
    out = run({tue: 90 * 60, wed: 90 * 60})
    w = out[2]
    assert w.carry_in == 1800
    assert w.carry_out == 0
    assert w.extra == 0


def test_no_pending_90_logged_gives_30_extra_and_no_credit_tomorrow():
    tue = MON + timedelta(days=1)
    out = run({MON: 60 * 60, tue: 90 * 60})
    t = out[1]
    assert t.goal_met and t.extra == 1800 and t.carry_out == 0
    wed = out[2]
    assert wed.carry_in == 0 and wed.target == 3600 and wed.missing_today == 3600


def test_rest_day_with_30_prior_and_20_logged_leaves_10():
    # sábado é descanso; deixa 30 min pendentes na sexta
    sat = MON + timedelta(days=5)
    logged = {d: 60 * 60 for d in day_span(MON, MON + timedelta(days=3))}
    logged[MON + timedelta(days=4)] = 30 * 60  # sexta faltou 30
    logged[sat] = 20 * 60
    out = run(logged)
    s = out[5]
    assert s.target == 0 and s.is_rest
    assert s.carry_in == 1800
    assert s.recovered == 1200
    assert s.carry_out == 600
    # descanso não gera nova obrigação
    assert s.missing_today == 0


def test_no_accumulate_policy_shows_deficit_but_does_not_carry():
    out = run({}, policy="none")
    assert out[0].deficit == 3600
    assert out[0].carry_out == 0
    assert out[1].carry_in == 0 and out[1].pending_prior == 0 and out[1].remaining_total == 3600


def test_no_targets_before_start_or_after_end():
    start = MON + timedelta(days=1)
    out = compute_balances(
        day_span(MON, MON + timedelta(days=4)),
        rules=(RuleSpec(effective_from=start, minutes_by_weekday=WEEKDAYS),),
        pauses=(),
        logged_by_date={},
        adjustments=(),
        policy="accumulate",
        start_date=start,
        end_date=MON + timedelta(days=2),
    )
    assert out[0].target == 0 and not out[0].in_range
    assert out[1].target == 3600 and out[2].target == 3600
    assert out[3].target == 0 and not out[3].in_range
    # pendência criada dentro do período continua visível após o encerramento
    assert out[3].carry_in == 7200


def test_pause_stops_new_targets_but_keeps_prior_pending():
    tue = MON + timedelta(days=1)
    wed = MON + timedelta(days=2)
    out = run({}, pauses=(PauseSpec(tue, wed),))
    assert out[1].is_paused and out[1].target == 0
    assert out[1].carry_in == 3600 and out[1].carry_out == 3600
    assert out[2].carry_out == 3600
    assert out[3].carry_in == 3600 and out[3].target == 3600


def test_goal_change_applies_from_explicit_date_without_rewriting_past():
    wed = MON + timedelta(days=2)
    new_rule = RuleSpec(
        effective_from=wed, minutes_by_weekday={**WEEKDAYS, "2": 30, "3": 30, "4": 30}, version=2
    )
    out = run({MON: 3600, MON + timedelta(days=1): 3600}, rules=(RULE, new_rule))
    assert out[0].target == 3600 and out[1].target == 3600
    assert out[2].target == 1800 and out[2].rule_version == 2


def test_forgiveness_is_explicit_adjustment_not_a_session():
    tue = MON + timedelta(days=1)
    out = run({}, adjustments=(AdjustmentSpec(applies_on=tue, seconds=3600),))
    assert out[1].carry_in == 3600
    assert out[1].forgiven == 3600
    assert out[1].carry_out == 3600  # 3600 + 3600 (terça) - 3600 perdoados
    assert out[1].logged == 0  # nenhuma sessão fictícia


def test_retroactive_correction_recomputes_from_first_affected_date():
    before = run({})
    assert before[2].carry_in == 7200
    after = run({MON: 3600})  # registro retroativo de segunda
    assert after[2].carry_in == 3600


def test_pending_120_distributed_over_four_days_does_not_create_new_debt():
    # 120 pendentes; sugestão +30/dia não altera as metas base nem o carry
    wed = MON + timedelta(days=2)
    out = run({}, open_day=wed)
    w = out[2]
    assert w.carry_in == 7200
    s = summarize_today(w, suggested_recovery=1800)
    assert s.target == 3600
    assert s.suggested_recovery == 1800
    assert s.next_step_seconds == 3600 + 1800
    assert s.pending_after_plan == 7200 - 1800
    assert s.remaining_total == 3600 + 7200


def test_mockup_example_40_logged_60_prior_20_suggested():
    tue = MON + timedelta(days=1)
    out = run({tue: 40 * 60}, open_day=tue)
    t = out[1]
    s = summarize_today(t, suggested_recovery=20 * 60)
    assert s.missing_today == 20 * 60
    assert s.pending_prior == 60 * 60
    assert s.suggested_recovery == 20 * 60
    assert s.next_step_seconds == 40 * 60
    assert s.pending_after_plan == 40 * 60


def test_two_activities_do_not_share_extra_time():
    # o motor é por objetivo: excedente de um objetivo não entra em outro
    tue = MON + timedelta(days=1)
    english = run({MON: 0, tue: 120 * 60})
    guitar = run({MON: 0, tue: 0})
    assert english[1].carry_out == 0
    assert guitar[1].carry_out == 7200


def test_streak_rules():
    days = day_span(MON, MON + timedelta(days=8))
    logged = {
        MON: 3600,
        MON + timedelta(days=1): 3600,
        MON + timedelta(days=2): 0,
        MON + timedelta(days=3): 3600,
        MON + timedelta(days=4): 3600,
    }
    out = compute_balances(
        days,
        rules=(RULE,),
        pauses=(),
        logged_by_date=logged,
        adjustments=(),
        policy="accumulate",
        start_date=MON,
        end_date=None,
    )
    # até domingo (fim de semana descanso não interrompe): qui, sex = 2
    cur, best = streak(out, MON + timedelta(days=6))
    assert cur == 2 and best == 2
    # segunda seguinte em aberto e sem registro não interrompe
    cur2, _ = streak(out, MON + timedelta(days=7))
    assert cur2 == 2


def test_open_day_does_not_carry_forward():
    tue = MON + timedelta(days=1)
    out = run({}, open_day=tue)
    assert len(out) == 2  # cálculo para após o dia aberto


@pytest.mark.parametrize("policy", ["accumulate", "accumulate_suggest"])
def test_policies_accumulate(policy):
    out = run({}, policy=policy)
    assert out[1].carry_in == 3600
