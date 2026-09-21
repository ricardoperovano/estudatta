"""Gamificação: XP, níveis, conquistas, desafios semanais e recordes pessoais.

Princípios:
- o XP de estudo é **calculado a partir dos dados** (minutos, metas cumpridas, questões,
  revisões, simulados); editar ou excluir uma sessão se reflete sem inflar pontos;
- bônus únicos (conquista desbloqueada, desafio semanal cumprido) ficam em `xp_events`,
  com chave de deduplicação;
- conquistas nunca são revogadas; quebrar a sequência não tira nada;
- a comparação é só consigo mesmo (sem ranking entre pessoas).
"""

from __future__ import annotations

import hashlib
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.i18n import _, set_locale
from app.core.timeutil import today_in, utcnow
from app.domain.balance import streak
from app.models.activity import Activity
from app.models.content import Material, Subject, Topic
from app.models.planning import PlannedTask
from app.models.session import SessionDayAllocation, StudySession
from app.models.study import MockExam, Revision, UserAchievement, XpEvent
from app.models.user import User
from app.services import balance as balance_service
from app.services.outbox import notify_inapp

# ---------------------------------------------------------------- XP e níveis
XP_PER_MINUTE = 1
XP_GOAL_DAY = 20
XP_PER_QUESTION = 1
XP_PER_CORRECT = 1
XP_REVISION = 15
XP_MOCK = 30
XP_ACHIEVEMENT = 25
XP_CHALLENGE = 50

LEVEL_TITLES = [
    "Primeiros passos",
    "Ritmo",
    "Constância",
    "Foco",
    "Disciplina",
    "Persistência",
    "Maratona",
    "Domínio do tempo",
    "Referência",
    "Lenda do estudo",
]


def level_for(xp: int) -> dict:
    """Nível L exige 50·L·(L+1) XP acumulado (100, 300, 600, 1000, 1500…)."""
    level = 0
    while 50 * (level + 1) * (level + 2) <= xp:
        level += 1
    floor = 50 * level * (level + 1)
    ceil = 50 * (level + 1) * (level + 2)
    number = level + 1
    title = _(LEVEL_TITLES[min(level, len(LEVEL_TITLES) - 1)])
    return {
        "number": number,
        "title": title,
        "xp_into_level": xp - floor,
        "xp_for_next": ceil - floor,
        "next_at": ceil,
    }


# ---------------------------------------------------------------- estatísticas
@dataclass
class Stats:
    total_seconds: int = 0
    sessions: int = 0
    goal_days: int = 0
    best_streak: int = 0
    current_streak: int = 0
    recovered_seconds: int = 0
    questions: int = 0
    correct: int = 0
    pages: int = 0
    revisions_done: int = 0
    mocks: int = 0
    mock_improved: bool = False
    best_mock_percent: float | None = None
    longest_session: int = 0
    early_bird: int = 0
    night_owl: int = 0
    pomodoros: int = 0
    full_weeks: int = 0
    best_coverage: int = 0
    tasks: int = 0
    materials: int = 0
    subjects: int = 0
    weekly_seconds: dict = field(default_factory=dict)
    weekly_questions: dict = field(default_factory=dict)
    goal_days_this_week: int = 0
    planned_days_this_week: int = 0


def _valid(user_id):
    return (
        StudySession.user_id == user_id,
        StudySession.status == "finished",
        StudySession.counts_toward_goal.is_(True),
        StudySession.needs_review.is_(False),
    )


def compute_stats(db: Session, user: User) -> Stats:
    st = Stats()
    tz = user.timezone or "America/Sao_Paulo"
    today = today_in(tz)
    week_start = today - timedelta(days=today.weekday())
    sessions = list(db.execute(select(StudySession).where(*_valid(user.id))).scalars())
    st.sessions = len(sessions)
    for s in sessions:
        st.total_seconds += int(s.duration_seconds or 0)
        st.questions += s.questions_total or 0
        st.correct += s.questions_correct or 0
        if s.page_from and s.page_to and s.page_to >= s.page_from:
            st.pages += min(2000, s.page_to - s.page_from + 1)
        st.longest_session = max(st.longest_session, int(s.duration_seconds or 0))
        if s.kind == "pomodoro":
            st.pomodoros += 1
        if s.started_at and s.entry_mode == "timed":
            local = s.started_at.astimezone(ZoneInfo(s.timezone or tz))
            if local.hour < 7:
                st.early_bird += 1
            if local.hour >= 22:
                st.night_owl += 1
    # tempo e questões por semana (recordes e desafios)
    rows = db.execute(
        select(
            SessionDayAllocation.local_date,
            SessionDayAllocation.seconds,
            StudySession.questions_total,
            StudySession.id,
        )
        .join(StudySession, StudySession.id == SessionDayAllocation.session_id)
        .where(*_valid(user.id))
    ).all()
    seen_q = set()
    for d, sec, qt, sid in rows:
        wk = d - timedelta(days=d.weekday())
        st.weekly_seconds[wk] = st.weekly_seconds.get(wk, 0) + int(sec or 0)
        if qt and sid not in seen_q:
            seen_q.add(sid)
            st.weekly_questions[wk] = st.weekly_questions.get(wk, 0) + qt
    # metas, sequências, recuperação, semanas completas
    acts = list(db.execute(select(Activity).where(Activity.user_id == user.id)).scalars())
    for act in acts:
        if act.tracking_mode == "checklist":
            continue
        days = balance_service.compute_activity_balances(db, act)
        act_today = today_in(act.timezone)
        cur, best = streak(days, act_today)
        st.best_streak = max(st.best_streak, best)
        st.current_streak = max(st.current_streak, cur)
        by_week: dict[date, list] = defaultdict(list)
        for d in days:
            if d.goal_met:
                st.goal_days += 1
            st.recovered_seconds += d.recovered
            if d.target > 0:
                by_week[d.local_date - timedelta(days=d.local_date.weekday())].append(d)
        for wk, ds in by_week.items():
            if wk + timedelta(days=6) < act_today and len(ds) >= 3 and all(x.goal_met for x in ds):
                st.full_weeks += 1
        this_week = [d for d in days if d.local_date >= week_start and d.target > 0]
        st.goal_days_this_week += sum(1 for d in this_week if d.goal_met)
        st.planned_days_this_week += len(
            [
                d
                for d in balance_service.project_targets(
                    db, act, week_start, week_start + timedelta(days=6)
                )
                if d.target > 0
            ]
        )
        # cobertura do edital (objetivos com pelo menos 10 tópicos)
        topics = list(
            db.execute(
                select(Topic)
                .join(Subject, Subject.id == Topic.subject_id)
                .where(Subject.activity_id == act.id)
            ).scalars()
        )
        if len(topics) >= 10:
            studied_ids = set(
                db.execute(
                    select(StudySession.topic_id).where(
                        StudySession.activity_id == act.id,
                        StudySession.status == "finished",
                        StudySession.topic_id.is_not(None),
                    )
                ).scalars()
            )
            studied = sum(1 for t in topics if t.status != "not_started" or t.id in studied_ids)
            st.best_coverage = max(st.best_coverage, round(100 * studied / len(topics)))
    st.revisions_done = int(
        db.execute(
            select(func.count())
            .select_from(Revision)
            .where(Revision.user_id == user.id, Revision.status == "done")
        ).scalar_one()
    )
    exams = list(
        db.execute(
            select(MockExam)
            .where(MockExam.user_id == user.id)
            .order_by(MockExam.taken_on, MockExam.created_at)
        ).scalars()
    )
    st.mocks = len(exams)
    best_so_far = None
    for e in exams:
        pct = 100 * e.correct / e.total_questions if e.total_questions else 0
        if best_so_far is not None and pct > best_so_far:
            st.mock_improved = True
        best_so_far = pct if best_so_far is None else max(best_so_far, pct)
    st.best_mock_percent = round(best_so_far, 1) if best_so_far is not None else None
    st.tasks = int(
        db.execute(
            select(func.count()).select_from(PlannedTask).where(PlannedTask.user_id == user.id)
        ).scalar_one()
    )
    st.materials = int(
        db.execute(
            select(func.count()).select_from(Material).where(Material.user_id == user.id)
        ).scalar_one()
    )
    st.subjects = int(
        db.execute(
            select(func.count()).select_from(Subject).where(Subject.user_id == user.id)
        ).scalar_one()
    )
    return st


def base_xp(st: Stats) -> int:
    return (
        st.total_seconds // 60 * XP_PER_MINUTE
        + st.goal_days * XP_GOAL_DAY
        + st.questions * XP_PER_QUESTION
        + st.correct * XP_PER_CORRECT
        + st.revisions_done * XP_REVISION
        + st.mocks * XP_MOCK
    )


# ---------------------------------------------------------------- conquistas
@dataclass(frozen=True)
class Achievement:
    code: str
    title: str
    description: str
    category: str
    icon: str  # nome de ícone Phosphor usado no app
    target: int

    def value(self, st: Stats) -> int:
        return METRICS[self.code](st)


def _h(n):
    return lambda st: st.total_seconds // 3600


METRICS = {}
ACHIEVEMENTS: list[Achievement] = []


def _add(code, title, desc, cat, icon, target, metric):
    ACHIEVEMENTS.append(Achievement(code, title, desc, cat, icon, target))
    METRICS[code] = metric


def a_title(a) -> str:
    """Título traduzido; "{n}" recebe o alvo da conquista."""
    return _(a.title, n=a.target)


def a_desc(a) -> str:
    return _(a.description, n=a.target)


_add(
    "first_session",
    "Primeira sessão",
    "Registrou a primeira sessão de estudo.",
    "primeiros_passos",
    "Play",
    1,
    lambda s: s.sessions,
)
_add(
    "first_goal",
    "Meta do dia",
    "Cumpriu a meta de um dia pela primeira vez.",
    "primeiros_passos",
    "Target",
    1,
    lambda s: s.goal_days,
)
_add(
    "full_week",
    "Semana completa",
    "Cumpriu a meta em todos os dias planejados de uma semana.",
    "primeiros_passos",
    "CalendarCheck",
    1,
    lambda s: s.full_weeks,
)
_add(
    "organizer",
    "Plano na mão",
    "Planejou 10 tarefas.",
    "primeiros_passos",
    "ListChecks",
    10,
    lambda s: s.tasks,
)
_add(
    "librarian",
    "Biblioteca",
    "Cadastrou o primeiro material de estudo.",
    "primeiros_passos",
    "Books",
    1,
    lambda s: s.materials,
)
for n in (3, 7, 14, 30, 60, 100):
    _add(
        f"streak_{n}",
        "Sequência de {n} dias",
        "Cumpriu a meta em {n} dias planejados seguidos.",
        "constancia",
        "Flame",
        n,
        lambda s: s.best_streak,
    )
_add(
    "four_full_weeks",
    "Mês redondo",
    "Completou 4 semanas inteiras de metas.",
    "constancia",
    "Medal",
    4,
    lambda s: s.full_weeks,
)
for n in (1, 10, 50, 100, 250, 500):
    _add(
        f"hours_{n}",
        "1 hora de estudo" if n == 1 else "{n} horas de estudo",
        "Somou 1 hora de estudo registrado." if n == 1 else "Somou {n} horas de estudo registrado.",
        "tempo",
        "Clock",
        n,
        lambda s: s.total_seconds // 3600,
    )
_add(
    "comeback",
    "Retomada",
    "Recuperou 1 hora de tempo pendente.",
    "retomada",
    "ArrowCounterClockwise",
    60,
    lambda s: s.recovered_seconds // 60,
)
_add(
    "comeback_master",
    "Mestre da retomada",
    "Recuperou 10 horas de tempo pendente.",
    "retomada",
    "Trophy",
    600,
    lambda s: s.recovered_seconds // 60,
)
_add(
    "marathon",
    "Maratona",
    "Fez uma sessão de 90 minutos.",
    "sessoes",
    "PersonSimpleRun",
    90,
    lambda s: s.longest_session // 60,
)
_add(
    "early_bird",
    "Madrugador",
    "Começou 5 sessões antes das 7h.",
    "sessoes",
    "SunHorizon",
    5,
    lambda s: s.early_bird,
)
_add(
    "night_owl",
    "Coruja",
    "Começou 5 sessões depois das 22h.",
    "sessoes",
    "MoonStars",
    5,
    lambda s: s.night_owl,
)
_add(
    "pomodoro_10",
    "Tomate maduro",
    "Concluiu 10 sessões no modo Pomodoro.",
    "sessoes",
    "Timer",
    10,
    lambda s: s.pomodoros,
)
_add(
    "sessions_100",
    "Cem sessões",
    "Registrou 100 sessões.",
    "sessoes",
    "Stack",
    100,
    lambda s: s.sessions,
)
for n in (100, 500, 1000, 5000):
    _add(
        f"questions_{n}",
        "{n} questões",
        "Resolveu {n} questões.",
        "questoes",
        "CheckSquare",
        n,
        lambda s: s.questions,
    )
_add(
    "sharpshooter",
    "Pontaria",
    "Chegou a 80% de acerto com pelo menos 100 questões.",
    "questoes",
    "Crosshair",
    80,
    lambda s: round(100 * s.correct / s.questions) if s.questions >= 100 else 0,
)
for n in (1, 10, 50, 200):
    _add(
        f"revisions_{n}",
        "Primeira revisão" if n == 1 else "{n} revisões",
        "Concluiu a primeira revisão." if n == 1 else "Concluiu {n} revisões.",
        "revisoes",
        "ArrowsClockwise",
        n,
        lambda s: s.revisions_done,
    )
for n in (25, 50, 75, 100):
    _add(
        f"coverage_{n}",
        {
            25: "Um quarto do edital",
            50: "Metade do edital",
            75: "Reta final do edital",
            100: "Edital completo",
        }[n],
        "Estudou {n}% dos tópicos de um objetivo com pelo menos 10 tópicos.",
        "edital",
        "MapTrifold",
        n,
        lambda s: s.best_coverage,
    )
_add(
    "mock_first",
    "Primeiro simulado",
    "Registrou o primeiro simulado.",
    "simulados",
    "Exam",
    1,
    lambda s: s.mocks,
)
_add(
    "mock_5", "Treino de prova", "Registrou 5 simulados.", "simulados", "Exam", 5, lambda s: s.mocks
)
_add(
    "mock_improve",
    "Evolução",
    "Superou o próprio melhor resultado em simulados.",
    "simulados",
    "TrendUp",
    1,
    lambda s: 1 if s.mock_improved else 0,
)
_add(
    "pages_100",
    "Cem páginas",
    "Leu 100 páginas registradas nas sessões.",
    "leitura",
    "BookOpen",
    100,
    lambda s: s.pages,
)
_add(
    "pages_1000",
    "Mil páginas",
    "Leu 1.000 páginas registradas nas sessões.",
    "leitura",
    "BookBookmark",
    1000,
    lambda s: s.pages,
)

CATEGORY_LABEL = {
    "primeiros_passos": "Primeiros passos",
    "constancia": "Constância",
    "tempo": "Tempo",
    "retomada": "Retomada",
    "sessoes": "Sessões",
    "questoes": "Questões",
    "revisoes": "Revisões",
    "edital": "Edital",
    "simulados": "Simulados",
    "leitura": "Leitura",
}
BY_CODE = {a.code: a for a in ACHIEVEMENTS}


# ---------------------------------------------------------------- desafios semanais
@dataclass
class Challenge:
    code: str
    title: str
    target: int
    progress: int
    unit: str

    @property
    def done(self) -> bool:
        return self.progress >= self.target


def _week_challenges(db: Session, user: User, st: Stats, week_start: date) -> list[Challenge]:
    week_end = week_start + timedelta(days=6)
    secs = st.weekly_seconds.get(week_start, 0)
    qs = st.weekly_questions.get(week_start, 0)
    revs = int(
        db.execute(
            select(func.count())
            .select_from(Revision)
            .where(
                Revision.user_id == user.id,
                Revision.status == "done",
                Revision.done_at
                >= datetime.combine(week_start, datetime.min.time()).replace(
                    tzinfo=ZoneInfo(user.timezone)
                ),
                Revision.done_at
                < datetime.combine(week_end + timedelta(days=1), datetime.min.time()).replace(
                    tzinfo=ZoneInfo(user.timezone)
                ),
            )
        ).scalar_one()
    )
    subj_count = len(
        {
            sid
            for sid in db.execute(
                select(StudySession.subject_id)
                .join(SessionDayAllocation, SessionDayAllocation.session_id == StudySession.id)
                .where(
                    *_valid(user.id),
                    StudySession.subject_id.is_not(None),
                    SessionDayAllocation.local_date >= week_start,
                    SessionDayAllocation.local_date <= week_end,
                )
            ).scalars()
        }
    )
    planned = max(1, st.planned_days_this_week)
    pool: list[Challenge] = [
        Challenge(
            "goal_days",
            _("Cumpra a meta em {n} dias", n=min(4, planned)),
            min(4, planned),
            st.goal_days_this_week,
            "dias",
        )
    ]
    recent_weeks = [
        st.weekly_questions.get(week_start - timedelta(weeks=i), 0) for i in range(1, 5)
    ]
    if any(recent_weeks) or qs:
        avg = (
            sum(recent_weeks) / max(1, len([x for x in recent_weeks if x]))
            if any(recent_weeks)
            else 30
        )
        target = max(20, int(round(avg * 1.1 / 10.0)) * 10)
        pool.append(
            Challenge("questions", _("Resolva {n} questões", n=target), target, qs, "questões")
        )
    if (
        st.revisions_done
        or db.execute(
            select(func.count()).select_from(Revision).where(Revision.user_id == user.id)
        ).scalar_one()
    ):
        pool.append(Challenge("revisions", _("Faça 3 revisões"), 3, revs, "revisões"))
    if st.subjects >= 2:
        pool.append(
            Challenge(
                "variety",
                _("Estude 3 matérias diferentes"),
                min(3, st.subjects),
                subj_count,
                "matérias",
            )
        )
    # meta de tempo baseada nas semanas anteriores (a atual não pode definir a própria meta)
    best_week = max((v for k, v in st.weekly_seconds.items() if k < week_start), default=0)
    if best_week >= 3600:
        target_min = max(60, int(round(best_week / 60 * 0.8 / 10.0)) * 10)
        pool.append(
            Challenge(
                "time",
                _("Estude {h}h{m} na semana", h=target_min // 60, m=f"{target_min % 60:02d}")
                if target_min % 60
                else _("Estude {h}h na semana", h=target_min // 60),
                target_min,
                secs // 60,
                "min",
            )
        )
    # escolha determinística de 3 (o primeiro é fixo; os demais variam por semana)
    first, rest = pool[0], pool[1:]
    seed = hashlib.sha256(f"{user.id}:{week_start}".encode()).hexdigest()
    rest.sort(key=lambda c: hashlib.sha256((seed + c.code).encode()).hexdigest())
    return [first, *rest[:2]]


# ---------------------------------------------------------------- avaliação
def _bonus_xp(db: Session, user: User) -> int:
    return int(
        db.execute(
            select(func.coalesce(func.sum(XpEvent.points), 0)).where(XpEvent.user_id == user.id)
        ).scalar_one()
    )


def _grant(db: Session, user: User, kind: str, key: str, points: int, title: str) -> bool:
    if db.execute(
        select(XpEvent).where(XpEvent.user_id == user.id, XpEvent.dedupe_key == key)
    ).scalar_one_or_none():
        return False
    db.add(
        XpEvent(
            user_id=user.id,
            kind=kind,
            dedupe_key=key,
            points=points,
            title=title,
            created_at=utcnow(),
        )
    )
    return True


def evaluate(db: Session, user: User, st: Stats | None = None) -> list[str]:
    """Desbloqueia conquistas alcançadas e credita desafios cumpridos. Idempotente.
    Retorna os códigos desbloqueados agora."""
    set_locale(user.locale)  # títulos gravados em XpEvent/notificações seguem o idioma da conta
    st = st or compute_stats(db, user)
    have = set(
        db.execute(select(UserAchievement.code).where(UserAchievement.user_id == user.id)).scalars()
    )
    new: list[str] = []
    for a in ACHIEVEMENTS:
        if a.code in have:
            continue
        if a.value(st) >= a.target:
            db.add(UserAchievement(user_id=user.id, code=a.code, unlocked_at=utcnow()))
            _grant(db, user, "achievement", f"achievement:{a.code}", XP_ACHIEVEMENT, a_title(a))
            notify_inapp(
                db,
                user_id=user.id,
                kind="achievement",
                title=_("Conquista: {title}", title=a_title(a)),
                body=a_desc(a),
                url="/app/conquistas",
                data={"code": a.code},
            )
            new.append(a.code)
    today = today_in(user.timezone)
    week_start = today - timedelta(days=today.weekday())
    for c in _week_challenges(db, user, st, week_start):
        if c.done:
            _grant(db, user, "challenge", f"challenge:{week_start}:{c.code}", XP_CHALLENGE, c.title)
    db.flush()
    return new


def profile(db: Session, user: User) -> dict:
    st = compute_stats(db, user)
    evaluate(db, user, st)
    xp = base_xp(st) + _bonus_xp(db, user)
    unlocked = {
        ua.code: ua
        for ua in db.execute(
            select(UserAchievement).where(UserAchievement.user_id == user.id)
        ).scalars()
    }
    today = today_in(user.timezone)
    week_start = today - timedelta(days=today.weekday())
    challenges = _week_challenges(db, user, st, week_start)
    achievements = []
    for a in ACHIEVEMENTS:
        ua = unlocked.get(a.code)
        v = a.value(st)
        achievements.append(
            {
                "code": a.code,
                "title": a_title(a),
                "description": a_desc(a),
                "category": a.category,
                "category_label": _(CATEGORY_LABEL[a.category]),
                "icon": a.icon,
                "target": a.target,
                "progress": min(v, a.target),
                "unlocked": ua is not None,
                "unlocked_at": ua.unlocked_at if ua else None,
                "seen": bool(ua and ua.seen_at),
            }
        )
    best_week = max(st.weekly_seconds.items(), key=lambda kv: kv[1], default=(None, 0))
    this_week = st.weekly_seconds.get(week_start, 0)
    recent_bonus = list(
        db.execute(
            select(XpEvent)
            .where(XpEvent.user_id == user.id)
            .order_by(XpEvent.created_at.desc())
            .limit(10)
        ).scalars()
    )
    return {
        "xp": xp,
        "level": level_for(xp),
        "xp_breakdown": {
            "minutes": st.total_seconds // 60 * XP_PER_MINUTE,
            "goal_days": st.goal_days * XP_GOAL_DAY,
            "questions": st.questions * XP_PER_QUESTION + st.correct * XP_PER_CORRECT,
            "revisions": st.revisions_done * XP_REVISION,
            "mocks": st.mocks * XP_MOCK,
            "bonus": _bonus_xp(db, user),
        },
        "achievements": achievements,
        "unlocked_count": len(unlocked),
        "total_achievements": len(ACHIEVEMENTS),
        "unseen": [a for a in achievements if a["unlocked"] and not a["seen"]],
        "challenges": {
            "week_start": week_start,
            "items": [
                {
                    "code": c.code,
                    "title": c.title,
                    "target": c.target,
                    "progress": min(c.progress, c.target),
                    "unit": _(c.unit),
                    "done": c.done,
                    "xp": XP_CHALLENGE,
                }
                for c in challenges
            ],
        },
        "records": {
            "best_week_seconds": best_week[1],
            "best_week_start": best_week[0],
            "this_week_seconds": this_week,
            "best_streak": st.best_streak,
            "current_streak": st.current_streak,
            "longest_session_seconds": st.longest_session,
            "most_questions_week": max(st.weekly_questions.values(), default=0),
            "best_mock_percent": st.best_mock_percent,
            "total_seconds": st.total_seconds,
            "total_questions": st.questions,
            "total_pages": st.pages,
        },
        "recent_bonus": [
            {"title": _(e.title), "points": e.points, "kind": e.kind, "created_at": e.created_at}
            for e in recent_bonus
        ],
    }


def mark_seen(db: Session, user: User, codes: list[str] | None) -> int:
    q = select(UserAchievement).where(
        UserAchievement.user_id == user.id, UserAchievement.seen_at.is_(None)
    )
    if codes:
        q = q.where(UserAchievement.code.in_(codes))
    n = 0
    for ua in db.execute(q).scalars():
        ua.seen_at = utcnow()
        n += 1
    db.flush()
    return n
