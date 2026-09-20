"""Importa todos os modelos para que Base.metadata e o Alembic os conheçam."""

from app.models.activity import (
    Activity,
    ActivityPause,
    ActivityTimezone,
    BalanceAdjustment,
    DailyLedger,
    GoalRule,
    RecoveryAllocation,
    RecoveryPlan,
)
from app.models.billing import BillingEvent, Plan, PlanPrice, PromoGrant, Subscription
from app.models.content import ImportJob, Material, MaterialTopic, Subject, Topic
from app.models.notification import Notification, NotificationDelivery, NotificationOutbox
from app.models.planning import PlannedTask, TaskSeries
from app.models.session import SessionDayAllocation, SessionInterval, SessionRevision, StudySession
from app.models.study import MockExam, MockExamSubject, Revision, UserAchievement, XpEvent
from app.models.system import (
    AiUsage,
    AppSetting,
    AuditLog,
    ContactMessage,
    SyncOperation,
    WaitlistEntry,
)
from app.models.user import (
    AuthSession,
    NotificationPreferences,
    OneTimeToken,
    PushSubscription,
    User,
    UserAvatar,
    UserPreferences,
)

__all__ = [
    "Activity",
    "ActivityPause",
    "ActivityTimezone",
    "BalanceAdjustment",
    "DailyLedger",
    "GoalRule",
    "RecoveryAllocation",
    "RecoveryPlan",
    "BillingEvent",
    "Plan",
    "PlanPrice",
    "PromoGrant",
    "Subscription",
    "ImportJob",
    "Material",
    "MaterialTopic",
    "Subject",
    "Topic",
    "Notification",
    "NotificationDelivery",
    "NotificationOutbox",
    "PlannedTask",
    "TaskSeries",
    "SessionDayAllocation",
    "SessionInterval",
    "SessionRevision",
    "StudySession",
    "AiUsage",
    "AppSetting",
    "AuditLog",
    "ContactMessage",
    "SyncOperation",
    "WaitlistEntry",
    "AuthSession",
    "NotificationPreferences",
    "OneTimeToken",
    "PushSubscription",
    "User",
    "UserAvatar",
    "UserPreferences",
    "MockExam",
    "MockExamSubject",
    "Revision",
    "UserAchievement",
    "XpEvent",
]
