"""Tela Hoje: um próximo passo executável por objetivo, agenda do dia, tarefas e sessão ativa."""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.i18n import _
from app.core.timeutil import today_in
from app.domain.messages import fmt_minutes
from app.models.activity import Activity, ActivityPause
from app.models.planning import PlannedTask
from app.models.user import User
from app.services import balance as balance_service
from app.services import sessions as session_service
from app.services.activities import list_activities


def next_step_sentence(summary, has_plan: bool) -> str:
    if not summary.in_range:
        return _("Este objetivo ainda não começou ou já terminou. Você pode ajustar as datas.")
    if summary.is_paused:
        return _("Pausa planejada: nada entra como pendência e os lembretes ficam em silêncio.")
    if summary.is_rest and summary.pending_prior == 0:
        return _("Hoje é dia de descanso. Nada a fazer aqui.")
    if summary.is_rest and summary.pending_prior > 0:
        return _(
            "Dia de descanso. Se quiser, recupere parte dos {pending} pendentes — sem obrigação.",
            pending=fmt_minutes(summary.pending_prior),
        )
    if summary.goal_met and summary.pending_prior == 0:
        extra = (
            _(" Tempo extra: {extra}.", extra=fmt_minutes(summary.extra)) if summary.extra else ""
        )
        return _("Meta de hoje cumprida.") + extra
    if summary.goal_met and summary.pending_prior > 0:
        return _(
            "Meta de hoje cumprida. Ainda ficam {pending} a recuperar de dias anteriores.",
            pending=fmt_minutes(summary.pending_prior),
        )
    parts = []
    if summary.missing_today:
        parts.append(_("{v} da meta", v=fmt_minutes(summary.missing_today)))
    if summary.suggested_recovery:
        parts.append(_("{v} de recuperação", v=fmt_minutes(summary.suggested_recovery)))
    total = summary.next_step_seconds
    sentence = _("Mais {v} hoje", v=fmt_minutes(total))
    if len(parts) == 2:
        sentence += f": {parts[0]} + {parts[1]}"
    elif parts:
        sentence += f": {parts[0]}"
    sentence += "."
    if summary.pending_prior:
        after = summary.pending_after_plan
        if after > 0:
            sentence += _(" Depois disso, ficam {v} a recuperar.", v=fmt_minutes(after))
        elif summary.suggested_recovery:
            sentence += _(" Depois disso, a pendência zera.")
    return sentence


def _agenda(db: Session, user: User, act_ids: list, d: date) -> list[PlannedTask]:
    if not act_ids:
        return []
    return list(
        db.execute(
            select(PlannedTask)
            .where(
                PlannedTask.user_id == user.id,
                PlannedTask.activity_id.in_(act_ids),
                PlannedTask.local_date == d,
            )
            .order_by(
                PlannedTask.start_time.nulls_last(), PlannedTask.sort_order, PlannedTask.created_at
            )
        ).scalars()
    )


def _week_totals(db: Session, act: Activity, today: date) -> tuple[int, int, int]:
    """(registrado na semana, meta da semana, dias com registro) — semana começa na segunda."""
    start = today - timedelta(days=today.weekday())
    end = start + timedelta(days=6)
    days = balance_service.compute_activity_balances(db, act, upto=min(end, today), open_day=today)
    future = (
        balance_service.project_targets(db, act, today + timedelta(days=1), end)
        if end > today
        else []
    )
    logged = sum(d.logged for d in days if d.local_date >= start)
    target = sum(d.target for d in days if d.local_date >= start) + sum(f.target for f in future)
    with_log = sum(1 for d in days if d.local_date >= start and d.logged > 0)
    return logged, target, with_log


def _checklist_summary(db: Session, act: Activity, d: date) -> dict:
    tasks = list(
        db.execute(
            select(PlannedTask).where(
                PlannedTask.activity_id == act.id, PlannedTask.local_date == d
            )
        ).scalars()
    )
    done = sum(1 for t in tasks if t.status == "done")
    return {"total": len(tasks), "done": done}


def today_view(db: Session, user: User) -> dict:
    activities = [a for a in list_activities(db, user) if a.status in ("active", "paused")]
    user_today = today_in(user.timezone)
    active = session_service.active_session(db, user)
    cards = []
    for act in activities:
        today = today_in(act.timezone)
        view = balance_service.activity_balance(db, act)
        s = view.today
        pause = (
            db.execute(
                select(ActivityPause).where(
                    ActivityPause.activity_id == act.id,
                    ActivityPause.start_date <= today,
                    ActivityPause.end_date >= today,
                )
            )
            .scalars()
            .first()
        )
        wl, wt, wd = _week_totals(db, act, today)
        card = {
            "activity": act,
            "local_date": today,
            "summary": s,
            "next_step": next_step_sentence(s, view.plan is not None) if s else "",
            "has_recovery_plan": view.plan is not None,
            "auto_suggestion": {d.isoformat(): v for d, v in view.auto_suggestion.items()},
            "streak_current": view.streak_current,
            "streak_best": view.streak_best,
            "week_logged": wl,
            "week_target": wt,
            "week_days_with_log": wd,
            "pause": pause,
            "checklist": _checklist_summary(db, act, today)
            if act.tracking_mode in ("checklist", "mixed")
            else None,
        }
        cards.append(card)
    agenda = _agenda(db, user, [a.id for a in activities], user_today)
    return {"date": user_today, "cards": cards, "agenda": agenda, "active_session": active}
