from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.i18n import _
from app.schemas.common import ORMModel

MAX_SUBJECTS = 200
MAX_TOPICS = 3000


def clean_title(v: str) -> str:
    """Texto vindo de documentos é dado não confiável: remove caracteres de controle,
    normaliza espaços e limita o tamanho. Nunca é interpretado, só armazenado."""
    v = "".join(ch for ch in v if ch.isprintable() or ch.isspace())
    return " ".join(v.split())[:200]


def _clean_title(v: str) -> str:
    v = clean_title(v)
    if not v:
        raise ValueError("Título vazio.")
    return v


class ProposalSubtopic(BaseModel):
    title: str = Field(min_length=1, max_length=400)
    page: int | None = Field(default=None, ge=1, le=100000)
    page_to: int | None = Field(default=None, ge=1, le=100000)
    estimated_minutes: int | None = Field(default=None, ge=1, le=6000)

    _clean = field_validator("title")(_clean_title)


class ProposalTopic(ProposalSubtopic):
    children: list[ProposalSubtopic] = Field(default_factory=list, max_length=500)


class ProposalSubject(BaseModel):
    title: str = Field(min_length=1, max_length=400)
    topics: list[ProposalTopic] = Field(default_factory=list, max_length=1000)

    _clean = field_validator("title")(_clean_title)


class ProposalIn(BaseModel):
    subjects: list[ProposalSubject] = Field(default_factory=list, max_length=MAX_SUBJECTS)
    stats: dict | None = None

    @model_validator(mode="after")
    def _limits(self):
        n = sum(len(s.topics) + sum(len(t.children) for t in s.topics) for s in self.subjects)
        if n > MAX_TOPICS:
            raise ValueError(
                _("A proposta tem {n} tópicos; o limite é {limit}.", n=n, limit=MAX_TOPICS)
            )
        return self

    def as_dict(self) -> dict:
        return self.model_dump(mode="json", exclude_none=False)


class ImportCreateJson(BaseModel):
    activity_id: UUID
    source: Literal["text", "csv"]
    content: str = Field(min_length=1, max_length=400_000)


class ImportPatch(BaseModel):
    proposal: ProposalIn


class ImportConfirm(BaseModel):
    proposal: ProposalIn | None = None


class ImportOut(ORMModel):
    id: UUID
    activity_id: UUID
    source: str
    status: str
    file_name: str | None
    size_bytes: int | None
    pages_total: int | None
    has_text_layer: bool | None
    proposal: dict | None
    error_code: str | None
    error_message: str | None
    material_id: UUID | None
    ai_used: bool
    started_at: datetime | None
    finished_at: datetime | None
    confirmed_at: datetime | None
    created_at: datetime


class ImportConfirmOut(BaseModel):
    import_job: ImportOut = Field(serialization_alias="import")
    created_subjects: int
    created_topics: int
    linked_topics: int
