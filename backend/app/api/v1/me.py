from __future__ import annotations

import csv
import io
import json
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.errors import NotFound, Unauthorized, ValidationFailed
from app.core.security import verify_password
from app.core.timeutil import utcnow, valid_timezone
from app.models.activity import Activity
from app.models.session import SessionDayAllocation, StudySession
from app.models.user import User, UserPreferences
from app.schemas.auth import UserOut
from app.schemas.common import OkResponse, ORMModel

router = APIRouter(prefix="/me", tags=["me"])


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)
    locale: str | None = Field(default=None, max_length=16)


class PreferencesOut(ORMModel):
    theme: str
    tone: str
    week_starts_on: int
    default_session_minutes: int
    pomodoro_focus_minutes: int
    pomodoro_break_minutes: int
    analytics_consent: bool | None
    reduced_motion: bool
    revisions_enabled: bool = True
    revision_intervals: list[int] = [1, 7, 30]
    mascot_enabled: bool = True
    tours_seen: list[str] = []
    extra: dict


class PreferencesUpdate(BaseModel):
    theme: Literal["system", "dark", "light"] | None = None
    tone: Literal["acolhedor", "direto", "firme"] | None = None
    week_starts_on: int | None = Field(default=None, ge=0, le=6)
    default_session_minutes: int | None = Field(default=None, ge=5, le=480)
    pomodoro_focus_minutes: int | None = Field(default=None, ge=5, le=120)
    pomodoro_break_minutes: int | None = Field(default=None, ge=1, le=60)
    analytics_consent: bool | None = None
    reduced_motion: bool | None = None
    revisions_enabled: bool | None = None
    revision_intervals: list[int] | None = None
    mascot_enabled: bool | None = None
    extra: dict | None = None


TOUR_KEY = r"^[a-z0-9][a-z0-9-]{0,39}$"
MAX_TOURS = 60


class TourSeenIn(BaseModel):
    key: str = Field(pattern=TOUR_KEY)


class TourResetIn(BaseModel):
    keys: list[Annotated[str, Field(pattern=TOUR_KEY)]] | None = None  # None = todos


class ToursOut(BaseModel):
    tours_seen: list[str]


class OnboardingComplete(BaseModel):
    completed: bool = True


class DeleteAccountRequest(BaseModel):
    password: str | None = None
    confirm: Literal["EXCLUIR"]


@router.get("", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.patch("", response_model=UserOut)
def update_profile(
    payload: ProfileUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> UserOut:
    if payload.name is not None:
        user.name = payload.name.strip()
    if payload.timezone is not None:
        if not valid_timezone(payload.timezone):
            raise ValidationFailed("Fuso horário inválido.", code="invalid_timezone")
        user.timezone = payload.timezone
    if payload.locale is not None:
        user.locale = payload.locale
    db.commit()
    return UserOut.model_validate(user)


@router.get("/preferences", response_model=PreferencesOut)
def get_preferences(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> PreferencesOut:
    prefs = db.get(UserPreferences, user.id)
    if prefs is None:
        prefs = UserPreferences(user_id=user.id)
        db.add(prefs)
        db.commit()
    return PreferencesOut.model_validate(prefs)


@router.patch("/preferences", response_model=PreferencesOut)
def update_preferences(
    payload: PreferencesUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PreferencesOut:
    prefs = db.get(UserPreferences, user.id) or UserPreferences(user_id=user.id)
    db.add(prefs)
    for k, v in payload.model_dump(exclude_unset=True).items():
        if k == "extra" and v is not None:
            prefs.extra = {**(prefs.extra or {}), **v}
        elif k == "revision_intervals" and v is not None:
            from app.services.revisions import validate_intervals

            prefs.revision_intervals = validate_intervals(v)
        elif v is not None or k == "analytics_consent":
            setattr(prefs, k, v)
    db.commit()
    return PreferencesOut.model_validate(prefs)


def _prefs(db: Session, user: User) -> UserPreferences:
    prefs = db.get(UserPreferences, user.id)
    if prefs is None:
        prefs = UserPreferences(user_id=user.id, tours_seen=[])
        db.add(prefs)
    return prefs


@router.post("/tours/seen", response_model=ToursOut)
def tour_seen(
    payload: TourSeenIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ToursOut:
    """Marca o tour de uma página como visto (concluído ou pulado). Idempotente."""
    prefs = _prefs(db, user)
    seen = list(prefs.tours_seen or [])
    if payload.key not in seen:
        seen = [*seen, payload.key][-MAX_TOURS:]
        prefs.tours_seen = seen
    db.commit()
    return ToursOut(tours_seen=seen)


@router.post("/tours/reset", response_model=ToursOut)
def tour_reset(
    payload: TourResetIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ToursOut:
    """Volta a mostrar os tours (todos ou só os informados)."""
    prefs = _prefs(db, user)
    keys = payload.keys
    prefs.tours_seen = (
        [] if keys is None else [k for k in (prefs.tours_seen or []) if k not in keys]
    )
    db.commit()
    return ToursOut(tours_seen=list(prefs.tours_seen))


@router.post("/onboarding", response_model=UserOut)
def complete_onboarding(
    payload: OnboardingComplete,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserOut:
    user.onboarding_completed_at = utcnow() if payload.completed else None
    db.commit()
    return UserOut.model_validate(user)


@router.get("/export")
def export_data(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Response:
    """Exporta os próprios dados (JSON). Independe de assinatura."""
    from app.models.content import Material, Subject, Topic
    from app.models.planning import PlannedTask

    def rows(model, order=None):
        q = select(model).where(model.user_id == user.id)
        return [
            {c.name: _json(getattr(r, c.name)) for c in model.__table__.columns}
            for r in db.execute(q).scalars()
        ]

    acts = list(db.execute(select(Activity).where(Activity.user_id == user.id)).scalars())
    payload = {
        "exported_at": utcnow().isoformat(),
        "user": {
            "email": user.email,
            "name": user.name,
            "timezone": user.timezone,
            "created_at": user.created_at.isoformat(),
        },
        "activities": [
            {
                **{c.name: _json(getattr(a, c.name)) for c in Activity.__table__.columns},
                "goal_rules": [
                    {
                        "effective_from": r.effective_from.isoformat(),
                        "minutes_by_weekday": r.minutes_by_weekday,
                        "daily_limit_minutes": r.daily_limit_minutes,
                    }
                    for r in a.goal_rules
                ],
                "pauses": [
                    {
                        "start_date": p.start_date.isoformat(),
                        "end_date": p.end_date.isoformat(),
                        "reason": p.reason,
                    }
                    for p in a.pauses
                ],
            }
            for a in acts
        ],
        "subjects": rows(Subject),
        "topics": rows(Topic),
        "materials": rows(Material),
        "planned_tasks": rows(PlannedTask),
        "sessions": rows(StudySession),
        "session_day_allocations": rows(SessionDayAllocation),
    }
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=estudatta-export.json"},
    )


@router.get("/export.csv")
def export_csv(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Response:
    """Histórico de sessões em CSV."""
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(
        [
            "data_local",
            "objetivo",
            "segundos",
            "minutos",
            "tipo",
            "inicio_utc",
            "fim_utc",
            "observacao",
            "paginas",
        ]
    )
    acts = {
        a.id: a.title
        for a in db.execute(select(Activity).where(Activity.user_id == user.id)).scalars()
    }
    q = (
        select(SessionDayAllocation, StudySession)
        .join(StudySession, StudySession.id == SessionDayAllocation.session_id)
        .where(SessionDayAllocation.user_id == user.id, StudySession.status == "finished")
        .order_by(SessionDayAllocation.local_date)
    )
    for alloc, s in db.execute(q).all():
        pages = f"{s.page_from or ''}-{s.page_to or ''}" if (s.page_from or s.page_to) else ""
        w.writerow(
            [
                alloc.local_date.isoformat(),
                acts.get(s.activity_id, ""),
                alloc.seconds,
                round(alloc.seconds / 60, 1),
                s.kind,
                s.started_at.isoformat() if s.started_at else "",
                s.ended_at.isoformat() if s.ended_at else "",
                (s.note or "").replace("\n", " "),
                pages,
            ]
        )
    return Response(
        content="﻿" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=estudatta-historico.csv"},
    )


@router.post("/delete", response_model=OkResponse)
def delete_account(
    payload: DeleteAccountRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OkResponse:
    """Exclusão de conta com confirmação. Registros operacionais (auditoria, eventos de cobrança)
    são mantidos de forma anonimizada pelo período definido pelo responsável (ver docs/privacidade)."""
    if user.password_hash and not verify_password(payload.password or "", user.password_hash):
        raise Unauthorized("Senha incorreta.", code="invalid_credentials")
    audit(db, actor_id=user.id, action="account.delete", target_type="user", target_id=str(user.id))
    from app.services import materials as materials_service

    materials_service.delete_all_user_files(db, user)
    db.delete(user)
    db.commit()

    resp = OkResponse(message="Conta excluída.")
    return resp


def _json(v):
    if isinstance(v, datetime):
        return v.isoformat()
    if hasattr(v, "isoformat"):
        return v.isoformat()
    if hasattr(v, "hex") and not isinstance(v, (bytes, str)):
        return str(v)
    return v


# --- Foto de perfil ------------------------------------------------------------------------
AVATAR_MAX_BYTES = 300 * 1024
AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp"}


@router.get("/avatar", include_in_schema=False)
def get_avatar(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Response:
    """A foto da própria conta (só quem está logado vê a sua). Cache longo: a URL muda por versão."""
    from app.models.user import UserAvatar

    av = db.get(UserAvatar, user.id)
    if av is None:
        raise NotFound("Sem foto de perfil.", code="no_avatar")
    return Response(
        content=av.data,
        media_type=av.content_type,
        headers={
            "Cache-Control": "private, max-age=31536000, immutable",
            "ETag": f'"{av.version}"',
        },
    )


@router.put("/avatar", response_model=UserOut)
def put_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserOut:
    """Troca a foto (JPEG, PNG ou WebP, até 300 KB; o app já corta e reduz para 256 px)."""
    import magic

    from app.core.timeutil import utcnow
    from app.models.user import UserAvatar

    data = file.file.read(AVATAR_MAX_BYTES + 1)
    if not data:
        raise ValidationFailed("Envie uma imagem.", code="avatar_empty")
    if len(data) > AVATAR_MAX_BYTES:
        raise ValidationFailed("A foto precisa ter até 300 KB.", code="avatar_too_large")
    kind = magic.from_buffer(data, mime=True)
    if kind not in AVATAR_TYPES:
        raise ValidationFailed("Use uma imagem JPEG, PNG ou WebP.", code="avatar_type")
    av = db.get(UserAvatar, user.id)
    if av is None:
        av = UserAvatar(
            user_id=user.id, content_type=kind, data=data, version=1, updated_at=utcnow()
        )
        db.add(av)
    else:
        av.content_type, av.data, av.version, av.updated_at = kind, data, av.version + 1, utcnow()
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.delete("/avatar", response_model=UserOut)
def delete_avatar(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> UserOut:
    from app.models.user import UserAvatar

    av = db.get(UserAvatar, user.id)
    if av is not None:
        db.delete(av)
        db.commit()
        db.refresh(user)
    return UserOut.model_validate(user)
