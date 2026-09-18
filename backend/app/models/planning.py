from __future__ import annotations

import uuid
from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import JSONType, Timestamps, UTCDateTime, UUIDPk


class TaskSeries(UUIDPk, Timestamps, Base):
    """Série recorrente: gera ocorrências identificadas por data (sem cópias infinitas)."""

    __tablename__ = "task_series"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    activity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    weekdays: Mapped[list] = mapped_column(JSONType, nullable=False)  # [0,2,4]
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)
    start_time: Mapped[time | None] = mapped_column(Time)
    estimated_seconds: Mapped[int | None] = mapped_column(Integer)
    subject_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subjects.id", ondelete="SET NULL")
    )
    topic_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("topics.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(
        String(16), nullable=False, default="checklist"
    )  # checklist | study
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class PlannedTask(UUIDPk, Timestamps, Base):
    """Tarefa/bloco planejado em uma data local. Ocorrência de série = (series_id, local_date)."""

    __tablename__ = "planned_tasks"
    __table_args__ = (
        UniqueConstraint("series_id", "local_date", name="uq_planned_task_series_date"),
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
    series_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("task_series.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(
        String(16), nullable=False, default="study"
    )  # study | checklist
    local_date: Mapped[date] = mapped_column(Date, nullable=False)
    original_date: Mapped[date | None] = mapped_column(Date)  # data original quando reagendada
    start_time: Mapped[time | None] = mapped_column(Time)
    estimated_seconds: Mapped[int | None] = mapped_column(Integer)
    page_from: Mapped[int | None] = mapped_column(Integer)
    page_to: Mapped[int | None] = mapped_column(Integer)
    priority: Mapped[int] = mapped_column(
        Integer, nullable=False, default=2
    )  # 1 alta · 2 normal · 3 baixa
    due_date: Mapped[date | None] = mapped_column(Date)
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="planned"
    )  # planned | done | skipped
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    recovery_seconds: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )  # rótulo "+20 de recuperação"
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    series: Mapped[TaskSeries | None] = relationship()


Index("ix_planned_tasks_user_date", PlannedTask.user_id, PlannedTask.local_date)
Index("ix_planned_tasks_activity_date", PlannedTask.activity_id, PlannedTask.local_date)
