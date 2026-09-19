from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import JSONType, Timestamps, UTCDateTime, UUIDPk


class StudySession(UUIDPk, Timestamps, Base):
    """Sessão de estudo (cronômetro, pomodoro ou lançamento manual)."""

    __tablename__ = "study_sessions"
    __table_args__ = (
        UniqueConstraint("user_id", "client_uuid", name="uq_session_user_client_uuid"),
        # Apenas uma sessão ativa/pausada por usuário (índice parcial)
        Index(
            "uq_session_one_active_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("status IN ('active','paused')"),
            sqlite_where=text("status IN ('active','paused')"),
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    activity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subjects.id", ondelete="SET NULL")
    )
    topic_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("topics.id", ondelete="SET NULL"))
    material_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("materials.id", ondelete="SET NULL")
    )
    planned_task_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("planned_tasks.id", ondelete="SET NULL")
    )
    kind: Mapped[str] = mapped_column(
        String(16), nullable=False, default="timer"
    )  # timer | pomodoro | manual
    entry_mode: Mapped[str] = mapped_column(
        String(16), nullable=False, default="timed"
    )  # timed | duration
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    # active | paused | finished | discarded
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    # Para entry_mode=duration: data local + duração sem horário
    local_date: Mapped[date | None] = mapped_column(Date)
    duration_seconds: Mapped[int | None] = mapped_column(
        Integer
    )  # duração válida consolidada (sem pausas)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    page_from: Mapped[int | None] = mapped_column(Integer)
    page_to: Mapped[int | None] = mapped_column(Integer)
    pomodoro_config: Mapped[dict | None] = mapped_column(JSONType)
    client_uuid: Mapped[uuid.UUID | None] = mapped_column()
    device_id: Mapped[str | None] = mapped_column(String(64))
    needs_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    review_reason: Mapped[str | None] = mapped_column(
        String(64)
    )  # long_running | overlap | offline_conflict
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    counts_toward_goal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # tipo de estudo: teoria | questoes | revisao | leitura | aula | pratica | outro
    study_type: Mapped[str] = mapped_column(
        String(16), nullable=False, default="teoria", server_default="teoria"
    )
    questions_total: Mapped[int | None] = mapped_column(Integer)
    questions_correct: Mapped[int | None] = mapped_column(Integer)

    intervals: Mapped[list[SessionInterval]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="SessionInterval.started_at",
    )
    day_allocations: Mapped[list[SessionDayAllocation]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    revisions: Mapped[list[SessionRevision]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="SessionRevision.created_at",
    )


class SessionInterval(UUIDPk, Base):
    """Intervalo persistido (foco ou pausa). ended_at nulo = intervalo aberto."""

    __tablename__ = "session_intervals"

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("study_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(8), nullable=False, default="focus")  # focus | pause
    started_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    source: Mapped[str] = mapped_column(
        String(16), nullable=False, default="server"
    )  # server | client
    block_index: Mapped[int | None] = mapped_column(Integer)  # pomodoro

    session: Mapped[StudySession] = relationship(back_populates="intervals")


class SessionDayAllocation(UUIDPk, Base):
    """Segundos válidos da sessão atribuídos a cada dia local (sessão pode cruzar a meia-noite)."""

    __tablename__ = "session_day_allocations"
    __table_args__ = (UniqueConstraint("session_id", "local_date", name="uq_session_day_alloc"),)

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("study_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    activity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    local_date: Mapped[date] = mapped_column(Date, nullable=False)
    seconds: Mapped[int] = mapped_column(Integer, nullable=False)

    session: Mapped[StudySession] = relationship(back_populates="day_allocations")


class SessionRevision(UUIDPk, Base):
    """Trilha de mudanças de sessões (edição retroativa, exclusão, revisão de conflito)."""

    __tablename__ = "session_revisions"

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("study_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    action: Mapped[str] = mapped_column(
        String(24), nullable=False
    )  # create | update | delete | review
    before: Mapped[dict | None] = mapped_column(JSONType)
    after: Mapped[dict | None] = mapped_column(JSONType)
    reason: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)

    session: Mapped[StudySession] = relationship(back_populates="revisions")


Index(
    "ix_session_alloc_activity_date",
    SessionDayAllocation.activity_id,
    SessionDayAllocation.local_date,
)
Index("ix_study_sessions_user_started", StudySession.user_id, StudySession.started_at)
