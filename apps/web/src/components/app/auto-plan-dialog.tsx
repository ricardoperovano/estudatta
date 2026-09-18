import * as React from "react";
import { Banner, Button, Card, Dialog, DialogActions, DialogContent, Field, Select, Spinner, toast } from "@/components/ui";
import { errorMessage } from "@/api/client";
import { useAutoPlanApply, useAutoPlanPreview, type AutoPlanOut } from "@/api/planning";
import type { Activity } from "@/api/types";
import { fmtDayTiny, fmtRange, minutesOf } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  activities: Activity[];
  defaultActivityId?: string | null;
  start: string;
  end: string;
}

const REASON: Record<string, string> = { nao_coube: "não coube na disponibilidade da semana", sem_estimativa: "sem duração estimada" };

/** Distribuição automática das tarefas de estudo na semana: sempre com prévia Antes/Depois antes de aplicar. */
export function AutoPlanDialog({ open, onOpenChange, activities, defaultActivityId, start, end }: Props) {
  const [activityId, setActivityId] = React.useState(defaultActivityId && activities.some((a) => a.id === defaultActivityId) ? defaultActivityId : (activities[0]?.id ?? ""));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Distribuir tarefas na semana" description={`${fmtRange(start, end)} · compare o plano antes de aplicar. Tarefas fixadas, séries e concluídas não saem do lugar.`} width="min(560px, calc(100% - 32px))">
        {activities.length > 1 ? (
          <Field label="Objetivo" htmlFor="ap-activity">
            <Select id="ap-activity" value={activityId} onChange={(e) => setActivityId(e.target.value)}>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {activityId ? <AutoPlanBody key={activityId} activityId={activityId} start={start} end={end} onClose={() => onOpenChange(false)} /> : <Banner kind="info">Crie um objetivo para distribuir tarefas.</Banner>}
      </DialogContent>
    </Dialog>
  );
}

function AutoPlanBody({ activityId, start, end, onClose }: { activityId: string; start: string; end: string; onClose: () => void }) {
  const preview = useAutoPlanPreview(activityId);
  const apply = useAutoPlanApply(activityId);
  const run = preview.mutate;
  React.useEffect(() => {
    run({ start, end });
  }, [run, start, end]);

  const data: AutoPlanOut | undefined = preview.data;
  const nothing = !!data && data.moves.length === 0;

  const column = (kind: "before" | "after") => (
    <Card className={cn("gap-1.5 bg-canvas p-[14px]", kind === "after" && "shadow-accent-ring")}>
      <span className={kind === "after" ? "kicker-accent" : "kicker"}>{kind === "after" ? "Depois" : "Antes"}</span>
      {(data?.days ?? []).map((d) => {
        const titles = kind === "after" ? d.after : d.before;
        const seconds = kind === "after" ? d.after_seconds : d.before_seconds;
        const over = d.target_seconds > 0 && seconds + d.fixed_seconds > d.target_seconds;
        return (
          <span key={d.local_date} className={cn("flex flex-col", !d.is_active && titles.length === 0 && "text-neutral-500")}>
            <span className="flex justify-between gap-2">
              <span>{fmtDayTiny(d.local_date)}</span>
              <span className={cn(over && "text-pending")}>{seconds + d.fixed_seconds > 0 ? minutesOf(seconds + d.fixed_seconds) : "—"}</span>
            </span>
            {titles.length > 0 ? <span className="truncate text-[12px] text-neutral-400">{titles.join(" · ")}</span> : null}
          </span>
        );
      })}
    </Card>
  );

  return (
    <>
      {preview.isPending || preview.isIdle ? (
        <div className="flex justify-center py-8" role="status">
          <Spinner className="h-6 w-6" />
        </div>
      ) : preview.isError ? (
        <Banner kind="error" actions={<Button size="sm" variant="secondary" onClick={() => run({ start, end })}>Tentar de novo</Button>}>
          {errorMessage(preview.error)}
        </Banner>
      ) : (
        <>
          {nothing ? <Banner kind="info">Nada a mover: as tarefas de estudo desta semana já cabem nos dias em que estão.</Banner> : null}
          <div className="tnum grid grid-cols-2 gap-3 text-[14px] tablet:gap-4">
            {column("before")}
            {column("after")}
          </div>
          {data && data.moves.length > 0 ? (
            <div className="flex flex-col gap-1 text-[13px]">
              <span className="kicker">O que muda</span>
              {data.moves.map((m) => (
                <span key={m.task_id} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">{m.title}</span>
                  <span className="tnum shrink-0 text-neutral-400">
                    {fmtDayTiny(m.from_date)} → <span className="text-accent">{fmtDayTiny(m.to_date)}</span>
                  </span>
                </span>
              ))}
            </div>
          ) : null}
          {data && data.unplaced.length > 0 ? (
            <Banner kind="info">
              {data.unplaced.length === 1 ? "1 tarefa fica onde está" : `${data.unplaced.length} tarefas ficam onde estão`}: {data.unplaced.map((u) => `${u.title} (${REASON[u.reason] ?? u.reason})`).join("; ")}.
            </Banner>
          ) : null}
        </>
      )}
      {apply.isError ? <Banner kind="error">{errorMessage(apply.error)}</Banner> : null}
      <DialogActions>
        <Button variant="secondary" size="lg" onClick={onClose}>
          {nothing ? "Fechar" : "Cancelar"}
        </Button>
        {!nothing ? (
          <Button
            variant="primary"
            size="lg"
            disabled={!data}
            loading={apply.isPending}
            onClick={async () => {
              try {
                const out = await apply.mutateAsync({ start, end });
                toast.success("Plano da semana atualizado", `${out.moves.length} ${out.moves.length === 1 ? "tarefa mudou" : "tarefas mudaram"} de dia.`);
                onClose();
              } catch {
                /* erro exibido acima */
              }
            }}
          >
            Aplicar distribuição
          </Button>
        ) : null}
      </DialogActions>
    </>
  );
}
