from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import JSONType, Timestamps, UTCDateTime, UUIDPk


class Subject(UUIDPk, Timestamps, Base):
    """Matéria de um objetivo (ex.: Gramática, Listening, Direito Administrativo)."""

    __tablename__ = "subjects"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    activity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    color: Mapped[str | None] = mapped_column(String(16))
    archived_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    topics: Mapped[list[Topic]] = relationship(
        back_populates="subject", cascade="all, delete-orphan", order_by="Topic.sort_order"
    )


class Topic(UUIDPk, Timestamps, Base):
    """Tópico/subtópico (árvore via parent_id)."""

    __tablename__ = "topics"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("topics.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="not_started"
    )  # not_started | in_progress | done
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    estimated_minutes: Mapped[int | None] = mapped_column(Integer)
    source_ref: Mapped[dict | None] = mapped_column(JSONType)  # {"import_id":..., "page": 12}
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    subject: Mapped[Subject] = relationship(back_populates="topics")
    material_links: Mapped[list[MaterialTopic]] = relationship(
        back_populates="topic", cascade="all, delete-orphan"
    )


class Material(UUIDPk, Timestamps, Base):
    """PDF enviado, link HTTPS ou referência física (livro)."""

    __tablename__ = "materials"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    activity_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("activities.id", ondelete="SET NULL"), index=True
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # pdf | link | physical
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(Text)
    file_key: Mapped[str | None] = mapped_column(String(300))
    file_name: Mapped[str | None] = mapped_column(String(255))
    mime_type: Mapped[str | None] = mapped_column(String(120))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    pages_total: Mapped[int | None] = mapped_column(Integer)
    page_from: Mapped[int | None] = mapped_column(Integer)
    page_to: Mapped[int | None] = mapped_column(Integer)
    last_position: Mapped[str | None] = mapped_column(String(120))  # "p. 46" ou "aula 3, 12:40"
    offline_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    archived_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    topic_links: Mapped[list[MaterialTopic]] = relationship(
        back_populates="material", cascade="all, delete-orphan"
    )


class MaterialTopic(UUIDPk, Base):
    """Vínculo material ↔ tópico com intervalo de páginas e último ponto informado."""

    __tablename__ = "material_topics"
    __table_args__ = (UniqueConstraint("material_id", "topic_id", name="uq_material_topic"),)

    material_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("materials.id", ondelete="CASCADE"), nullable=False, index=True
    )
    topic_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("topics.id", ondelete="CASCADE"), nullable=False, index=True
    )
    page_from: Mapped[int | None] = mapped_column(Integer)
    page_to: Mapped[int | None] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(String(300))
    last_position: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)

    material: Mapped[Material] = relationship(back_populates="topic_links")
    topic: Mapped[Topic] = relationship(back_populates="material_links")


class ImportJob(UUIDPk, Timestamps, Base):
    """Importação assíncrona de conteúdo programático (texto, CSV, PDF)."""

    __tablename__ = "imports"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    activity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source: Mapped[str] = mapped_column(String(16), nullable=False)  # text | csv | pdf
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="queued")
    # queued | processing | needs_review | confirmed | failed | cancelled
    file_key: Mapped[str | None] = mapped_column(String(300))
    file_name: Mapped[str | None] = mapped_column(String(255))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    pages_total: Mapped[int | None] = mapped_column(Integer)
    raw_text: Mapped[str | None] = mapped_column(Text)
    has_text_layer: Mapped[bool | None] = mapped_column(Boolean)
    proposal: Mapped[dict | None] = mapped_column(
        JSONType
    )  # {"subjects":[{"title","topics":[{"title","page"}]}]}
    error_code: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(String(500))
    material_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("materials.id", ondelete="SET NULL")
    )
    ai_used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    confirmed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


Index("ix_topics_subject_parent", Topic.subject_id, Topic.parent_id)
