import * as React from "react";
import { Dialog, DialogContent, Button, Field, Input, Seg, Select, Banner } from "@/components/ui";
import { useManualSession } from "@/api/queries";
import { errorMessage, isNetworkError } from "@/api/client";
import { todayIso } from "@/lib/format";
import { enqueueOp } from "@/offline/sync";
import { useUser } from "@/api/session";
import { toast } from "@/components/ui/toast";
import { uuid } from "@/lib/utils";
import type { TodayCard } from "@/api/types";

/** Folha "Registrar tempo": presets 15/30/45/60/Outro, quando, conteúdo, páginas. */
export function ManualEntrySheet({ card, cards, open, onOpenChange, defaultDate }: { card: TodayCard; cards: TodayCard[]; open: boolean; onOpenChange: (o: boolean) => void; defaultDate?: string }) {
  const user = useUser();
  const manual = useManualSession();
  const [activityId, setActivityId] = React.useState(card.activity.id);
  const [preset, setPreset] = React.useState<string>("30");
  const [custom, setCustom] = React.useState("");
  const [date, setDate] = React.useState(defaultDate || todayIso());
  const [time, setTime] = React.useState("");
  const [note, setNote] = React.useState("");
  const [pages, setPages] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const minutes = preset === "outro" ? Number(custom) || 0 : Number(preset);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (minutes < 1) {
      setError("Informe uma duração de pelo menos 1 minuto.");
      return;
    }
    const [pf, pt] = pages.replace(/[^\d–-]/g, "").split(/[–-]/).map((x) => (x ? Number(x) : undefined));
    const body = {
      activity_id: activityId,
      duration_seconds: minutes * 60,
      local_date: date,
      start_time: time || null,
      note: note || null,
      page_from: pf ?? null,
      page_to: pt ?? null,
      client_uuid: uuid(),
    };
    try {
      await manual.mutateAsync(body);
      toast.success(`${minutes} min registrados`, "A pendência foi ajustada.");
      onOpenChange(false);
    } catch (err) {
      if (isNetworkError(err) && user) {
        await enqueueOp(user.id, "session.manual", body, body.client_uuid);
        toast.offline("Registro salvo neste aparelho", "Vamos sincronizar quando você voltar à internet.");
        onOpenChange(false);
        return;
      }
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mode="sheet" title="Registrar tempo" description="Você estudou e esqueceu de registrar? Adicione agora — a pendência se ajusta.">
        <form onSubmit={submit} className="flex flex-col gap-[14px]">
          {error ? <Banner kind="error">{error}</Banner> : null}
          {cards.length > 1 ? (
            <Field label="Objetivo" htmlFor="m-activity">
              <Select id="m-activity" value={activityId} onChange={(e) => setActivityId(e.target.value)}>
                {cards.map((c) => (
                  <option key={c.activity.id} value={c.activity.id}>
                    {c.activity.title}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Seg
            block
            size="lg"
            label="Duração"
            value={preset}
            onChange={setPreset}
            options={[
              { value: "15", label: "15" },
              { value: "30", label: "30" },
              { value: "45", label: "45" },
              { value: "60", label: "60" },
              { value: "outro", label: "Outro" },
            ]}
          />
          {preset === "outro" ? (
            <Field label="Minutos" htmlFor="m-custom">
              <Input id="m-custom" type="number" inputMode="numeric" min={1} max={960} value={custom} onChange={(e) => setCustom(e.target.value)} />
            </Field>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Quando" htmlFor="m-date">
              <Input id="m-date" type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Horário (opcional)" htmlFor="m-time">
              <Input id="m-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          <Field label="Conteúdo (opcional)" htmlFor="m-note">
            <Input id="m-note" placeholder="Vocabulário · lista 12" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
          </Field>
          <Field label="Páginas (opcional)" htmlFor="m-pages">
            <Input id="m-pages" placeholder="p. 40–46" value={pages} onChange={(e) => setPages(e.target.value)} />
          </Field>
          <Button type="submit" size="xl" block loading={manual.isPending}>
            Salvar {minutes > 0 ? `${minutes} min` : ""}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
