import { t } from "@/i18n";
import * as React from "react";
import { Link } from "react-router";
import { useInsights, type Insights } from "@/api/study";
import { Bar, Button, Card, Select, Spinner } from "@/components/ui";
import { fmtPct, sessionHref } from "@/components/app/revisions-utils";
import { cn } from "@/lib/utils";

const DIFFICULTY_LABEL: Record<string, string> = {
  facil: t("fácil"),
  media: t("média"),
  dificil: t("difícil"),
};

interface Props {
  activityId: string;
  /** Com mais de um objetivo, mostra um seletor compacto. */
  activities?: { id: string; title: string }[];
  /** Na tela Hoje: some quando não há nada para mostrar (sem matérias, tópicos, metas ou questões). */
  hideWhenEmpty?: boolean;
  className?: string;
}

/** Análise do estudo: próxima matéria sugerida, edital coberto e metas semanais de questões/páginas. */
export function StudyInsightsCard({ activityId, activities, hideWhenEmpty, className }: Props) {
  const [picked, setPicked] = React.useState<string | null>(null);
  const current = picked && activities?.some((a) => a.id === picked) ? picked : activityId;
  const insights = useInsights(current);
  const selectId = React.useId();

  const data = insights.data;
  const empty = !!data && isEmpty(data);
  if (hideWhenEmpty && (!data || empty) && !picked) return null;

  const switcher =
    activities && activities.length > 1 ? (
      <>
        <label htmlFor={selectId} className="sr-only">
          {t("Objetivo da análise")}
        </label>
        <Select
          id={selectId}
          value={current}
          onChange={(e) => setPicked(e.target.value)}
          className="min-h-[32px] w-auto max-w-[55%] py-0.5 text-[12px]"
        >
          {activities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </Select>
      </>
    ) : null;

  return (
    <Card
      as="section"
      elev="sm"
      className={cn("gap-4 p-4", className)}
      aria-labelledby={`${selectId}-title`}
      data-tour="seu-estudo"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${selectId}-title`} className="text-[17px] font-medium">
          {t("Seu estudo")}
        </h2>
        {switcher}
      </div>

      {insights.isPending ? (
        <div className="flex justify-center py-4" role="status" aria-label={t("Carregando análise")}>
          <Spinner />
        </div>
      ) : insights.isError || !data ? (
        <p className="text-[13px] text-neutral-400">
          {t("Não foi possível carregar a análise.")}{" "}
          <button
            type="button"
            className="text-accent underline-offset-2 hover:underline"
            onClick={() => void insights.refetch()}
          >
            {t("Tentar de novo")}
          </button>
        </p>
      ) : empty ? (
        <p className="text-[13px] text-neutral-400">
          {t(
            "Cadastre as matérias e os tópicos deste objetivo para ver a próxima matéria sugerida e quanto do edital você já cobriu.",
          )}{" "}
          <Link to={`/app/objetivos/${current}`}>{t("Cadastrar matérias")}</Link>
        </p>
      ) : (
        <>
          <NextSubject data={data} activityId={current} />
          <Coverage data={data} />
          <Week data={data} activityId={current} />
        </>
      )}
    </Card>
  );
}

function isEmpty(d: Insights): boolean {
  const w = d.week;
  return (
    !d.next_subject &&
    d.coverage.topics_total === 0 &&
    !w.questions_goal &&
    !w.pages_goal &&
    w.questions === 0 &&
    w.pages === 0
  );
}

function NextSubject({ data, activityId }: { data: Insights; activityId: string }) {
  const n = data.next_subject;
  if (!n) {
    return (
      <div className="flex flex-col gap-1">
        <span className="kicker">{t("Próxima matéria sugerida")}</span>
        <p className="text-[13px] text-neutral-400">
          {t("Sem matérias cadastradas, não há como sugerir a próxima.")}{" "}
          <Link to={`/app/objetivos/${activityId}`}>{t("Cadastrar matérias")}</Link>
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="kicker-accent">{t("Próxima matéria sugerida")}</span>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-[16px] font-medium">{n.subject_title}</span>
          {n.topic_title ? <span className="block text-[13px] text-neutral-300">{n.topic_title}</span> : null}
          <span className="block text-[12px] text-neutral-400">
            {t("peso {{v0}} · dificuldade {{v1}}", {
              v0: n.weight,
              v1: DIFFICULTY_LABEL[n.difficulty] ?? n.difficulty,
            })}
          </span>
        </div>
        <Button asChild variant="primary" size="lg">
          <Link
            to={sessionHref({ activityId, subjectId: n.subject_id, topicId: n.topic_id })}
            aria-label={t("Começar sessão de {{v0}}", { v0: n.subject_title })}
          >
            {t("Começar")}
          </Link>
        </Button>
      </div>
      <p className="text-[13px] leading-[1.45] text-neutral-400">{n.reason}</p>
    </div>
  );
}

function Coverage({ data }: { data: Insights }) {
  const c = data.coverage;
  if (c.topics_total === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="kicker">{t("Edital coberto")}</span>
        <span className="tnum text-[12px] text-neutral-400">
          {t("{{v0}} tópicos", { v0: c.topics_total })}
        </span>
      </div>
      <Meter
        label={t("Estudado")}
        value={c.topics_studied}
        total={c.topics_total}
        percent={c.percent_studied}
        color="accent-600"
      />
      <Meter
        label={t("Concluído")}
        value={c.topics_done}
        total={c.topics_total}
        percent={c.percent_done}
        color="success"
      />
    </div>
  );
}

function Week({ data, activityId }: { data: Insights; activityId: string }) {
  const w = data.week;
  const hasGoals = !!w.questions_goal || !!w.pages_goal;
  const hasAny = hasGoals || w.questions > 0 || w.pages > 0;
  return (
    <div className="flex flex-col gap-2">
      <span className="kicker">{t("Nesta semana")}</span>
      {!hasAny ? (
        <p className="text-[13px] text-neutral-400">
          {t(
            "Nenhuma questão ou página registrada nesta semana. Anote questões e acertos ao encerrar uma sessão para acompanhar o desempenho.",
          )}
        </p>
      ) : (
        <>
          {w.questions_goal ? (
            <Meter
              label={t("Questões")}
              value={w.questions}
              total={w.questions_goal}
              percent={Math.round((100 * w.questions) / w.questions_goal)}
              color={w.questions >= w.questions_goal ? "success" : "accent"}
              unit={t("da meta")}
            />
          ) : w.questions > 0 ? (
            <Line label={t("Questões")} value={String(w.questions)} />
          ) : null}
          {w.pages_goal ? (
            <Meter
              label={t("Páginas")}
              value={w.pages}
              total={w.pages_goal}
              percent={Math.round((100 * w.pages) / w.pages_goal)}
              color={w.pages >= w.pages_goal ? "success" : "accent"}
              unit={t("da meta")}
            />
          ) : w.pages > 0 ? (
            <Line label={t("Páginas")} value={String(w.pages)} />
          ) : null}
          {w.accuracy != null ? (
            <Line
              label={t("Acertos")}
              value={t("{{v0}} de {{v1}} {{v2}}", {
                v0: fmtPct(w.accuracy),
                v1: w.questions,
                v2: w.questions === 1 ? t("questão") : t("questões"),
              })}
            />
          ) : null}
        </>
      )}
      {!hasGoals ? (
        <p className="text-[12px] text-neutral-400">
          {t("Sem meta semanal de questões ou páginas.")}{" "}
          <Link to={`/app/objetivos/${activityId}?aba=config`}>{t("Definir metas")}</Link>
        </p>
      ) : null}
    </div>
  );
}

function Meter({
  label,
  value,
  total,
  percent,
  color,
  unit,
}: {
  label: string;
  value: number;
  total: number;
  percent: number;
  color: "accent" | "accent-600" | "success";
  unit?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="tnum flex items-baseline justify-between gap-2 text-[13px]">
        <span>{label}</span>
        <span className="text-neutral-400">
          {t("{{v0}} de {{v1}} · {{v2}}%{{v3}}", {
            v0: value,
            v1: total,
            v2: Math.min(999, percent),
            v3: unit ? ` ${unit}` : "",
          })}
        </span>
      </div>
      <Bar
        value={total > 0 ? value / total : 0}
        color={color}
        label={t("{{v0}}: {{v1}} de {{v2}}", { v0: label, v1: value, v2: total })}
      />
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="tnum flex items-baseline justify-between gap-2 text-[13px]">
      <span>{label}</span>
      <span className="text-neutral-400">{value}</span>
    </div>
  );
}
