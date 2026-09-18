"""Ajusta os limites do plano gratuito no catálogo (o banco é recriado a cada teste)."""

from __future__ import annotations

from sqlalchemy import select

from app.core.db import SessionLocal
from app.models.billing import Plan


def set_free_plan_limits(**limits) -> dict:
    """Ex.: `set_free_plan_limits(max_materials=2, ai_daily_actions=1)`."""
    with SessionLocal() as db:
        plan = db.execute(select(Plan).where(Plan.code == "free")).scalar_one()
        plan.limits = {**(plan.limits or {}), **limits}
        db.commit()
        return dict(plan.limits)
