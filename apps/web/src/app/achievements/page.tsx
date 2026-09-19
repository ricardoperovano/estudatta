import * as React from "react";
import { Link } from "react-router";
import { Banner, Bar, Button, Card, Seg, Spinner, Tag } from "@/components/ui";
import { errorMessage } from "@/api/client";
import { useGamification, useMarkAchievementsSeen, type Achievement, type Gamification } from "@/api/study";
import { AchievementBadge } from "@/components/app/achievement-icon";
import { TataCompanion } from "@/components/mascot/TataCompanion";
import { fmtDayShort, fmtMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePageTour } from "@/components/tour/use-tours";
import { conquistasTour } from "@/tours/conquistas";

type Filter = "todas" | "desbloqueadas" | "bloqueadas";

/**
 * Conquistas: nível e XP, desafios da semana, recordes pessoais e medalhas. Tudo sai dos seus
 * registros; não há ranking entre pessoas, e conquistas nunca são retiradas.
 */
export default function AchievementsPage() {
  const g = useGamification();
  const seen = useMarkAchievementsSeen();
  const [filter, setFilter] = React.useState<Filter>("todas");
  usePageTour(conquistasTour, !!g.data);

  // abrir a página conta como "vi": some o destaque de novidade
  const unseenCount = g.data?.unseen.length ?? 0;
  const { mutate: markSeen } = seen;
  React.useEffect(() => {
    if (unseenCount > 0) markSeen(undefined);
  }, [unseenCount, markSeen]);

  if (g.isPending) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (g.isError || !g.data) {
    return (
      <Banner kind="error" actions={<Button size="sm" variant="secondary" onClick={() => g.refetch()}>Tentar de novo</Button>}>
        {errorMessage(g.error, "Não foi possível carregar suas conquistas.")}
      </Banner>
    );
  }
  const d = g.data;
  const list = d.achievements.filter((a) => (filter === "todas" ? true : filter === "desbloqueadas" ? a.unlocked : !a.unlocked));
  const groups = groupBy(list);

  return (
    <div className="flex flex-col gap-[14px] desktop:gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[25px]">Conquistas</h1>
        <p className="m-0 text-[14px] text-neutral-400">Tudo vem dos seus registros. Não há ranking, e conquistas nunca são retiradas.</p>
      </header>

      <LevelCard d={d} />

      <section aria-labelledby="desafios" className="flex flex-col gap-3" data-tour="conquistas-desafios">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="desafios" className="text-[17px] font-medium">Desafios da semana</h2>
          <span className="text-[12px] text-neutral-400">desde {fmtDayShort(d.challenges.week_start)}</span>
        </div>
        <div className="grid gap-3 tablet:grid-cols-3">
          {d.challenges.items.map((c) => (
            <Card key={c.code} elev="sm" className="gap-2 p-4" accent={c.done}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[14px] font-medium">{c.title}</span>
                {c.done ? <Tag variant="success">Feito</Tag> : <Tag variant="neutral" icon={false}>+{c.xp} XP</Tag>}
              </div>
              <Bar value={c.target ? c.progress / c.target : 0} color={c.done ? "success" : "accent"} label={`${c.title}: ${c.progress} de ${c.target} ${c.unit}`} />
              <span className="tnum text-[12px] text-neutral-400">
                {c.progress} de {c.target} {c.unit}
              </span>
            </Card>
          ))}
        </div>
        <p className="m-0 text-[12px] text-neutral-500">Os desafios mudam toda semana e se ajustam ao seu histórico. Semana sem desafio cumprido não tira nada.</p>
      </section>

      <Records d={d} />

      <section aria-labelledby="medalhas" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3" data-tour="conquistas-medalhas">
          <h2 id="medalhas" className="text-[17px] font-medium">
            Medalhas <span className="tnum text-[14px] font-normal text-neutral-400">{d.unlocked_count} de {d.total_achievements}</span>
          </h2>
          <Seg<Filter>
            label="Filtrar medalhas"
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "todas", label: "Todas" },
              { value: "desbloqueadas", label: "Desbloqueadas" },
              { value: "bloqueadas", label: "A conquistar" },
            ]}
          />
        </div>
        {groups.length === 0 ? (
          <p className="m-0 py-6 text-center text-[14px] text-neutral-400">
            {filter === "desbloqueadas" ? "Nenhuma ainda. A primeira vem com a primeira sessão registrada." : "Você desbloqueou todas. Impressionante!"}
          </p>
        ) : (
          groups.map(([label, items]) => (
            <div key={label} className="flex flex-col gap-2">
              <h3 className="kicker text-neutral-400">{label}</h3>
              <ul className="m-0 grid list-none gap-2 p-0 tablet:grid-cols-2 desktop:grid-cols-3">
                {items.map((a) => (
                  <AchievementRow key={a.code} a={a} />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function LevelCard({ d }: { d: Gamification }) {
  const lv = d.level;
  const pct = lv.xp_for_next ? lv.xp_into_level / lv.xp_for_next : 1;
  const parts: [string, number][] = [
    ["Minutos estudados", d.xp_breakdown.minutes ?? 0],
    ["Metas do dia", d.xp_breakdown.goal_days ?? 0],
    ["Questões e acertos", d.xp_breakdown.questions ?? 0],
    ["Revisões", d.xp_breakdown.revisions ?? 0],
    ["Simulados", d.xp_breakdown.mocks ?? 0],
    ["Bônus (conquistas e desafios)", d.xp_breakdown.bonus ?? 0],
  ];
  return (
    <Card elev="md" className="flex-row flex-wrap items-center gap-4 p-4 desktop:p-6" data-tour="conquistas-nivel">
      <TataCompanion size={88} scene={{ kind: "static", mood: d.unseen.length ? "cheer" : "idle", text: levelLine(d) }} className="max-tablet:w-full" />
      <div className="flex min-w-[220px] flex-1 flex-col gap-2">
        <span className="kicker text-accent">Nível {lv.number}</span>
        <span className="text-[22px] font-semibold leading-tight">{lv.title}</span>
        <Bar value={pct} height={8} label={`${lv.xp_into_level} de ${lv.xp_for_next} XP para o próximo nível`} />
        <span className="tnum text-[13px] text-neutral-400">
          {d.xp} XP no total · faltam {Math.max(0, lv.next_at - d.xp)} XP para o nível {lv.number + 1}
        </span>
        <details className="text-[13px] text-neutral-300">
          <summary className="cursor-pointer text-neutral-400 hover:text-primary">De onde vem o XP</summary>
          <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
            {parts.map(([k, v]) => (
              <li key={k} className="flex justify-between gap-4">
                <span>{k}</span>
                <span className="tnum">{v} XP</span>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-[12px] text-neutral-500">1 XP por minuto de foco, +20 por dia com meta cumprida, +1 por questão e +1 por acerto, +15 por revisão, +30 por simulado.</p>
        </details>
      </div>
    </Card>
  );
}

function levelLine(d: Gamification) {
  if (d.unseen.length === 1) return `Conquista nova: ${d.unseen[0].title}!`;
  if (d.unseen.length > 1) return `${d.unseen.length} conquistas novas!`;
  if (d.xp === 0) return "Registre sua primeira sessão e a gente começa a colecionar medalhas.";
  return `Nível ${d.level.number}: ${d.level.title}. Tô orgulhoso!`;
}

function Records({ d }: { d: Gamification }) {
  const r = d.records;
  const rows: [string, string][] = [
    ["Melhor semana", r.best_week_seconds ? `${fmtMinutes(r.best_week_seconds)}${r.best_week_start ? ` · semana de ${fmtDayShort(r.best_week_start)}` : ""}` : "—"],
    ["Esta semana", r.this_week_seconds ? fmtMinutes(r.this_week_seconds) : "—"],
    ["Maior sequência", r.best_streak ? `${r.best_streak} ${r.best_streak === 1 ? "dia" : "dias"}` : "—"],
    ["Sequência atual", r.current_streak ? `${r.current_streak} ${r.current_streak === 1 ? "dia" : "dias"}` : "—"],
    ["Sessão mais longa", r.longest_session_seconds ? fmtMinutes(r.longest_session_seconds) : "—"],
    ["Mais questões numa semana", r.most_questions_week ? String(r.most_questions_week) : "—"],
    ["Melhor simulado", r.best_mock_percent != null ? `${r.best_mock_percent.toLocaleString("pt-BR")}%` : "—"],
    ["Total estudado", r.total_seconds ? fmtMinutes(r.total_seconds) : "—"],
    ["Questões resolvidas", r.total_questions ? String(r.total_questions) : "—"],
    ["Páginas lidas", r.total_pages ? String(r.total_pages) : "—"],
  ];
  return (
    <section aria-labelledby="recordes" className="flex flex-col gap-3" data-tour="conquistas-recordes">
      <h2 id="recordes" className="text-[17px] font-medium">Recordes pessoais</h2>
      <dl className="m-0 grid grid-cols-2 gap-2 tablet:grid-cols-5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 rounded-md bg-surface p-3">
            <dt className="text-[12px] text-neutral-400">{k}</dt>
            <dd className="tnum m-0 text-[15px] font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="m-0 text-[12px] text-neutral-500">
        Recordes comparam você com você mesmo. <Link to="/app/relatorio">Ver relatório</Link>
      </p>
    </section>
  );
}

function AchievementRow({ a }: { a: Achievement }) {
  const pct = a.target ? Math.min(1, a.progress / a.target) : 0;
  return (
    <li className={cn("flex items-center gap-3 rounded-md bg-surface p-3", !a.unlocked && "opacity-80")}>
      <AchievementBadge icon={a.icon} unlocked={a.unlocked} size={44} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2 text-[14px] font-medium">
          {a.title}
          {a.unlocked && !a.seen ? <Tag variant="accent" icon={false}>Nova</Tag> : null}
        </span>
        <span className="text-[12px] text-neutral-400">{a.description}</span>
        {a.unlocked ? (
          a.unlocked_at ? <span className="text-[11px] text-neutral-500">Desbloqueada em {fmtDayShort(a.unlocked_at)}</span> : null
        ) : a.target > 1 ? (
          <div className="flex items-center gap-2">
            <Bar value={pct} className="flex-1" label={`${a.title}: ${a.progress} de ${a.target}`} />
            <span className="tnum text-[11px] text-neutral-500">
              {Math.min(a.progress, a.target)}/{a.target}
            </span>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function groupBy(list: Achievement[]): [string, Achievement[]][] {
  const m = new Map<string, Achievement[]>();
  for (const a of list) m.set(a.category_label, [...(m.get(a.category_label) ?? []), a]);
  return [...m.entries()];
}
