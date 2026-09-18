"""Entradas das rotas de IA e **saídas validadas** do modelo (nunca confiamos no texto cru)."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.imports import ProposalIn


class AiStatusOut(BaseModel):
    enabled: bool
    remaining_today: int
    plan_limit: int
    global_budget_left: int | None = None
    reason: str | None = None


class SuggestStructureIn(BaseModel):
    text: str | None = Field(default=None, min_length=1)
    import_id: UUID | None = None
    activity_id: UUID | None = None


class SuggestStructureOut(BaseModel):
    proposal: ProposalIn
    truncated: bool = False
    model: str | None = None
    note: str = "Prévia gerada por IA. Nada foi criado; revise e confirme na importação."


class SuggestPlanIn(BaseModel):
    activity_id: UUID
    start: date | None = None
    end: date | None = None
    horizon_days: int = Field(default=14, ge=1, le=60)
    objective: str | None = Field(default=None, max_length=500)
    topic_ids: list[UUID] | None = Field(default=None, max_length=300)


class PlanItemOut(BaseModel):
    local_date: date
    topic_id: UUID
    estimated_seconds: int = Field(ge=60, le=16 * 3600)
    title: str | None = None


class SuggestPlanOut(BaseModel):
    items: list[PlanItemOut]
    rejected: list[dict] = Field(default_factory=list)
    model: str | None = None
    note: str = "Prévia gerada por IA. Nada foi agendado; aplique pelo planejamento se fizer sentido."


class WeeklySummaryIn(BaseModel):
    activity_id: UUID
    week_start: date | None = None


class WeeklySummaryOut(BaseModel):
    text: str
    facts: dict
    model: str | None = None


# --- Saídas cruas do modelo (schemas usados para validar o JSON devolvido) -----


class _ModelPlanItem(BaseModel):
    local_date: date
    topic_id: str
    estimated_seconds: int = Field(ge=1, le=24 * 3600)


class ModelPlanOutput(BaseModel):
    items: list[_ModelPlanItem] = Field(max_length=400)


class ModelSummaryOutput(BaseModel):
    text: str = Field(min_length=1, max_length=1200)

    @field_validator("text")
    @classmethod
    def _clean(cls, v: str) -> str:
        return " ".join(v.split())
