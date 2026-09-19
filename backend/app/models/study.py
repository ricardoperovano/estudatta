"""Revisões espaçadas e simulados."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import Timestamps, UTCDateTime, UUIDPk


class Revision(UUIDPk, Timestamps, Base):
    """Revisão agendada de um tópico (ou matéria) a partir de uma sessão de estudo.

    Etapas seguem os intervalos do usuário (padrão 1, 7 e 30 dias). Concluir uma etapa agenda a
    próxima; a primeira nasce de uma sessão de teoria, leitura, aula ou prática."""

    __tablename__ = "revisions"
    __table_args__ = (
        UniqueConstraint("source_session_id", "step", name="uq_revision_source_step"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    activity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE")
    )
    topic_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("topics.id", ondelete="CASCADE"))
    source_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("study_sessions.id", ondelete="SET NULL")
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    step: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    interval_days: Mapped[int] = mapped_column(Integer, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        String(12), nullable=False, default="pending"
    )  # pending | done | skipped
    done_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    done_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("study_sessions.id", ondelete="SET NULL")
    )


class MockExam(UUIDPk, Timestamps, Base):
    """Simulado ou prova anterior, com resultado total e por matéria."""

    __tablename__ = "mock_exams"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    activity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    taken_on: Mapped[date] = mapped_column(Date, nullable=False)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    correct: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)

    subjects: Mapped[list[MockExamSubject]] = relationship(
        back_populates="exam", cascade="all, delete-orphan", order_by="MockExamSubject.position"
    )


class MockExamSubject(UUIDPk, Base):
    __tablename__ = "mock_exam_subjects"

    exam_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("mock_exams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subjects.id", ondelete="SET NULL")
    )
    subject_title: Mapped[str] = mapped_column(String(160), nullable=False)
    total: Mapped[int] = mapped_column(Integer, nullable=False)
    correct: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    exam: Mapped[MockExam] = relationship(back_populates="subjects")


class XpEvent(UUIDPk, Base):
    """Bônus de XP concedidos uma única vez (desafio semanal, conquista). O XP de estudo em si é
    calculado a partir dos dados, então edições e exclusões se refletem sem inflar pontos."""

    __tablename__ = "xp_events"
    __table_args__ = (UniqueConstraint("user_id", "dedupe_key", name="uq_xp_user_dedupe"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(24), nullable=False)  # challenge | achievement
    dedupe_key: Mapped[str] = mapped_column(String(120), nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)


class UserAchievement(UUIDPk, Base):
    """Conquista desbloqueada (nunca é revogada). `seen_at` controla a comemoração no app."""

    __tablename__ = "user_achievements"
    __table_args__ = (UniqueConstraint("user_id", "code", name="uq_user_achievement"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(48), nullable=False)
    unlocked_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    seen_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


Index("ix_revisions_user_due", Revision.user_id, Revision.status, Revision.due_date)
Index("ix_mock_exams_activity_date", MockExam.activity_id, MockExam.taken_on)
