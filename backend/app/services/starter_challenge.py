"""Desafio de começo: "estude 3 dias em 7", por convite.

Os desafios semanais existem para quem já estuda; este é para criar o hábito de voltar. Ele só
vale se a pessoa aceitar — o convite aparece na tela Hoje e recusar é uma resposta legítima.
O estado fica em `UserPreferences.starter_challenge`:

    {"status": "accepted" | "declined" | "done", "start": "AAAA-MM-DD", "at": ISO, "done_at": ISO}

Conta qualquer dia com sessão concluída, de qualquer duração: o desafio é voltar, não bater meta.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.i18n import _, set_locale
from app.core.timeutil import today_in, utcnow
from app.models.activity import Activity
from app.models.session import StudySession
from app.models.study import XpEvent
from app.models.user import User, UserPreferences
from app.services.outbox import notify_inapp

TARGET_DAYS = 3
WINDOW_DAYS = 7
XP_STARTER = 50
DECLINE_QUIET = timedelta(days=7)  # recusou: o convite não volta nesta semana
DONE_VISIBLE = timedelta(days=3)  # concluído: o cartão comemora por alguns dias e some


def _prefs(db: Session, user: User) -> UserPreferences:
    prefs = db.get(UserPreferences, user.id)
    if prefs is None:
        prefs = UserPreferences(user_id=user.id)
        db.add(prefs)
        db.flush()
    return prefs


def _days_studied(db: Session, user: User, start: date, end: date) -> int:
    return int(
        db.execute(
            select(func.count(func.distinct(StudySession.local_date))).where(
                StudySession.user_id == user.id,
                StudySession.status == "finished",
                StudySession.local_date >= start,
                StudySession.local_date <= end,
            )
        ).scalar_one()
    )


def _parse(value: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(value) if value else None
    except ValueError:
        return None


def state(db: Session, user: User, *, now: datetime | None = None) -> dict:
    """Estado para a tela Hoje. Conclui o desafio (XP + aviso) quando a meta é alcançada."""
    now = now or utcnow()
    today = today_in(user.timezone)
    data = dict(_prefs(db, user).starter_challenge or {})
    out = {
        "state": "none",
        "target": TARGET_DAYS,
        "progress": 0,
        "window_days": WINDOW_DAYS,
        "ends_on": None,
        "xp": XP_STARTER,
    }
    status = data.get("status")

    if status == "accepted":
        start = date.fromisoformat(data["start"])
        end = start + timedelta(days=WINDOW_DAYS - 1)
        progress = _days_studied(db, user, start, min(end, today))
        out.update(progress=min(progress, TARGET_DAYS), ends_on=end)
        if progress >= TARGET_DAYS:
            _complete(db, user, data, now)
            out["state"] = "done"
        elif today > end:
            out["state"] = "offer"  # o prazo passou: sem cobrança, só um novo convite
            out.update(progress=0, ends_on=None)
        else:
            out["state"] = "active"
        return out

    if status == "done":
        done_at = _parse(data.get("done_at"))
        if done_at and now - done_at < DONE_VISIBLE:
            out.update(state="done", progress=TARGET_DAYS)
        return out

    if status == "declined":
        at = _parse(data.get("at"))
        if at and now - at < DECLINE_QUIET:
            return out

    has_goal = db.execute(
        select(func.count()).select_from(Activity).where(Activity.user_id == user.id)
    ).scalar_one()
    if has_goal:
        out["state"] = "offer"
    return out


def answer(db: Session, user: User, accept: bool, *, now: datetime | None = None) -> dict:
    """Registra a resposta ao convite. Aceitar de novo um desafio em curso não reinicia o prazo."""
    now = now or utcnow()
    prefs = _prefs(db, user)
    data = dict(prefs.starter_challenge or {})
    if accept:
        em_curso = data.get("status") == "accepted" and today_in(
            user.timezone
        ) <= date.fromisoformat(data["start"]) + timedelta(days=WINDOW_DAYS - 1)
        if data.get("status") != "done" and not em_curso:
            prefs.starter_challenge = {
                "status": "accepted",
                "start": today_in(user.timezone).isoformat(),
                "at": now.isoformat(),
            }
    elif data.get("status") != "done":
        prefs.starter_challenge = {"status": "declined", "at": now.isoformat()}
    db.flush()
    return state(db, user, now=now)


def _complete(db: Session, user: User, data: dict, now: datetime) -> None:
    prefs = _prefs(db, user)
    prefs.starter_challenge = {**data, "status": "done", "done_at": now.isoformat()}
    key = "challenge:starter"
    if db.execute(
        select(XpEvent).where(XpEvent.user_id == user.id, XpEvent.dedupe_key == key)
    ).scalar_one_or_none():
        db.flush()
        return
    set_locale(user.locale)
    title = _("Desafio de começo: {n} dias de estudo", n=TARGET_DAYS)
    db.add(
        XpEvent(
            user_id=user.id,
            kind="challenge",
            dedupe_key=key,
            points=XP_STARTER,
            title=title,
            created_at=now,
        )
    )
    notify_inapp(
        db,
        user_id=user.id,
        kind="achievement",
        title=_("Desafio concluído!"),
        body=_(
            "Você estudou {n} dias. +{xp} XP — e o mais difícil, que é voltar, já virou hábito.",
            n=TARGET_DAYS,
            xp=XP_STARTER,
        ),
        url="/app/conquistas",
    )
    db.flush()
