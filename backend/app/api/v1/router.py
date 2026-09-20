from fastapi import APIRouter

from app.api.v1 import (
    activities,
    admin,
    admin_growth,
    ai,
    auth,
    billing,
    content,
    dashboard,
    files,
    health,
    imports,
    materials,
    me,
    notifications,
    oauth,
    planning,
    public,
    reports,
    sessions,
    study,
    sync,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(public.router)
api_router.include_router(auth.router)
api_router.include_router(oauth.router)
api_router.include_router(me.router)
api_router.include_router(activities.router)
api_router.include_router(content.router)
api_router.include_router(sessions.router)
api_router.include_router(dashboard.router)
api_router.include_router(planning.router)
api_router.include_router(reports.router)
api_router.include_router(materials.router)
api_router.include_router(files.router)
api_router.include_router(imports.router)
api_router.include_router(notifications.router)
api_router.include_router(sync.router)
api_router.include_router(study.router)
api_router.include_router(billing.router)
api_router.include_router(ai.router)
api_router.include_router(admin.router)
api_router.include_router(admin_growth.router)
