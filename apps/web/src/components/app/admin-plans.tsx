/** Painel administrativo — catálogo de planos e preços. */
import { t } from "@/i18n";
import * as React from "react";
import { Plus } from "@phosphor-icons/react";
import { errorMessage } from "@/api/client";
import {
  useAdminPlans,
  useCreatePlan,
  useSetPlanPrices,
  useUpdatePlan,
  type PlanAdmin,
  type PlanPriceIn,
  type PlanUpdateIn,
} from "@/api/admin";
import {
  centsToInput,
  fmtDate,
  intervalLabel,
  isPlainObject,
  parseReais,
  stableJson,
} from "@/components/app/admin-format";
import { LimitsEditor } from "@/components/app/admin-limits";
import { AdminTitle, KeyValues, QueryGate } from "@/components/app/admin-shared";
import {
  Banner,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  EmptyState,
  Field,
  Input,
  Switch,
  Tag,
  Textarea,
  toast,
} from "@/components/ui";
import { fmtBRL } from "@/lib/format";

const INTERVALS = ["month", "year"] as const;
type Interval = (typeof INTERVALS)[number];
const CODE_RE = /^[a-z][a-z0-9_-]{1,31}$/;

function parseFeatures(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function parseOrder(text: string): number | null {
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n <= 1000 ? n : null;
}

export function AdminPlansPage() {
  const plans = useAdminPlans();
  const [creating, setCreating] = React.useState(false);
  return (
    <div className="flex flex-col gap-[14px] desktop:gap-6">
      <AdminTitle
        title={t("Planos")}
        subtitle={t("Catálogo, limites e preços. Preço vazio aparece como “Valor a definir”.")}
        actions={
          <Button size="lg" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden /> {t("Criar plano")}
          </Button>
        }
      />
      <QueryGate query={plans}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState
              title={t("Nenhum plano no catálogo.")}
              action={
                <Button size="lg" onClick={() => setCreating(true)}>
                  {t("Criar plano")}
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {list.map((p) => (
                <PlanCard key={p.id} plan={p} />
              ))}
            </div>
          )
        }
      </QueryGate>
      <Dialog open={creating} onOpenChange={setCreating}>
        {creating ? <CreatePlanDialog onDone={() => setCreating(false)} /> : null}
      </Dialog>
    </div>
  );
}

function PlanCard({ plan }: { plan: PlanAdmin }) {
  const [editing, setEditing] = React.useState(false);
  return (
    <Card as="article" accent={plan.recommended} className="gap-3 p-4 desktop:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[17px] font-medium leading-[1.2]">{plan.name}</h2>
            <code className="text-[12px] text-neutral-400">{plan.code}</code>
            {plan.recommended ? <Tag variant="outline">{t("recomendado")}</Tag> : null}
            <Tag variant={plan.active ? "success" : "neutral"}>{plan.active ? t("ativo") : t("inativo")}</Tag>
          </div>
          <span className="tnum text-[13px] text-neutral-400">
            {t("{{v0}} · ordem {{v1}}", {
              v0: INTERVALS.map(
                (i) =>
                  `${fmtBRL(plan.prices.find((p) => p.interval === i)?.amount_cents)} / ${intervalLabel(i)}`,
              ).join(" · "),
              v1: plan.sort_order,
            })}
          </span>
        </div>
        <Button variant="secondary" size="lg" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
          {editing ? t("Fechar") : t("Editar")}
        </Button>
      </div>
      {editing ? (
        <PlanEditor key={`${plan.id}:${plan.updated_at ?? ""}:${stableJson(plan.prices)}`} plan={plan} />
      ) : (
        <>
          {plan.description ? <p className="m-0 text-[13px] opacity-80">{plan.description}</p> : null}
          {plan.features.length ? (
            <ul className="m-0 list-disc pl-5 text-[13px]">
              {plan.features.map((f, i) => (
                <li key={i}>{String(f)}</li>
              ))}
            </ul>
          ) : null}
          <KeyValues data={plan.limits} />
          <span className="tnum text-[11px] text-neutral-400">
            {t("Atualizado: {{v0}}", { v0: fmtDate(plan.updated_at ?? plan.created_at) })}
          </span>
        </>
      )}
    </Card>
  );
}

function PlanEditor({ plan }: { plan: PlanAdmin }) {
  const update = useUpdatePlan();
  const setPrices = useSetPlanPrices();
  const priceOf = (i: Interval) => plan.prices.find((p) => p.interval === i);

  const [name, setName] = React.useState(plan.name);
  const [description, setDescription] = React.useState(plan.description ?? "");
  const [features, setFeatures] = React.useState(plan.features.map(String).join("\n"));
  const [limits, setLimits] = React.useState<Record<string, unknown>>(
    isPlainObject(plan.limits) ? plan.limits : {},
  );
  const [recommended, setRecommended] = React.useState(plan.recommended);
  const [active, setActive] = React.useState(plan.active);
  const [order, setOrder] = React.useState(String(plan.sort_order));
  const [price, setPrice] = React.useState<Record<Interval, string>>({
    month: centsToInput(priceOf("month")?.amount_cents),
    year: centsToInput(priceOf("year")?.amount_cents),
  });
  const [error, setError] = React.useState<string | null>(null);

  const featureList = parseFeatures(features);
  const orderN = parseOrder(order);
  const cents: Record<Interval, number | null | undefined> = {
    month: parseReais(price.month),
    year: parseReais(price.year),
  };

  const nameError = name.trim() ? null : t("Informe o nome.");
  const featuresError = featureList.length > 30 ? t("Máximo de 30 recursos.") : null;
  const orderError = orderN === null ? t("Inteiro de 0 a 1000.") : null;
  const priceError = (i: Interval) => (cents[i] === undefined ? t("Valor inválido. Ex.: 19,90") : null);

  const body: PlanUpdateIn = {};
  if (name.trim() !== plan.name) body.name = name.trim();
  if ((description.trim() || null) !== (plan.description ?? null))
    body.description = description.trim() || null;
  if (stableJson(featureList) !== stableJson(plan.features)) body.features = featureList;
  if (stableJson(limits) !== stableJson(plan.limits)) body.limits = limits;
  if (recommended !== plan.recommended) body.recommended = recommended;
  if (active !== plan.active) body.active = active;
  if (orderN !== null && orderN !== plan.sort_order) body.sort_order = orderN;
  const planDirty = Object.keys(body).length > 0;
  const pricesDirty = INTERVALS.some(
    (i) => cents[i] !== undefined && cents[i] !== (priceOf(i)?.amount_cents ?? null),
  );
  const invalid = !!(nameError || featuresError || orderError || priceError("month") || priceError("year"));
  const saving = update.isPending || setPrices.isPending;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    setError(null);
    try {
      if (planDirty) await update.mutateAsync({ id: plan.id, body });
      if (pricesDirty) {
        const prices: PlanPriceIn[] = INTERVALS.map((i) => ({
          interval: i,
          amount_cents: cents[i] ?? null,
          currency: priceOf(i)?.currency ?? "BRL",
          active: priceOf(i)?.active ?? true,
        }));
        await setPrices.mutateAsync({ id: plan.id, prices });
      }
      toast("success", t("Plano salvo"), plan.name);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-4 border-t border-divider pt-4" noValidate>
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-[1fr_120px]">
        <Field label={t("Nome")} htmlFor={`plan-name-${plan.id}`} error={nameError}>
          <Input
            id={`plan-name-${plan.id}`}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            invalid={!!nameError}
          />
        </Field>
        <Field label={t("Ordem")} htmlFor={`plan-order-${plan.id}`} error={orderError}>
          <Input
            id={`plan-order-${plan.id}`}
            inputMode="numeric"
            className="tnum"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            invalid={!!orderError}
          />
        </Field>
      </div>
      <Field label={t("Descrição")} htmlFor={`plan-desc-${plan.id}`}>
        <Textarea
          id={`plan-desc-${plan.id}`}
          value={description}
          maxLength={2000}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field
        label={t("Recursos (um por linha)")}
        htmlFor={`plan-feat-${plan.id}`}
        error={featuresError}
        hint={t("{{v0}} de 30", { v0: featureList.length })}
      >
        <Textarea
          id={`plan-feat-${plan.id}`}
          value={features}
          onChange={(e) => setFeatures(e.target.value)}
          className="min-h-[140px]"
          invalid={!!featuresError}
        />
      </Field>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex min-h-[44px] items-center gap-3 text-[14px]">
          <Switch checked={recommended} onCheckedChange={setRecommended} label={t("Recomendado")} />{" "}
          {t("Recomendado")}
        </label>
        <label className="flex min-h-[44px] items-center gap-3 text-[14px]">
          <Switch checked={active} onCheckedChange={setActive} label={t("Ativo")} />{" "}
          {t("Ativo (visível para novas assinaturas)")}
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <span className="kicker">{t("Preços (R$)")}</span>
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2">
          {INTERVALS.map((i) => (
            <Field
              key={i}
              label={t("Por {{v0}}", { v0: intervalLabel(i) })}
              htmlFor={`plan-price-${plan.id}-${i}`}
              error={priceError(i)}
              hint={
                cents[i] === null
                  ? t("Vazio = “Valor a definir”")
                  : cents[i] !== undefined
                    ? fmtBRL(cents[i])
                    : undefined
              }
            >
              <Input
                id={`plan-price-${plan.id}-${i}`}
                inputMode="decimal"
                className="tnum"
                placeholder={t("Valor a definir")}
                value={price[i]}
                onChange={(e) => setPrice((p) => ({ ...p, [i]: e.target.value }))}
                invalid={!!priceError(i)}
              />
            </Field>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="kicker">{t("Limites")}</span>
        <LimitsEditor idPrefix={`plan-${plan.id}`} value={limits} onChange={setLimits} />
      </div>

      {error ? <Banner kind="error">{error}</Banner> : null}
      <div className="flex items-center justify-end gap-3">
        {!planDirty && !pricesDirty ? (
          <span className="text-[12px] text-neutral-400">{t("Sem alterações.")}</span>
        ) : null}
        <Button type="submit" size="lg" loading={saving} disabled={invalid || (!planDirty && !pricesDirty)}>
          {t("Salvar plano")}
        </Button>
      </div>
    </form>
  );
}

function CreatePlanDialog({ onDone }: { onDone: () => void }) {
  const create = useCreatePlan();
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [order, setOrder] = React.useState("0");
  const [active, setActive] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const codeError = CODE_RE.test(code)
    ? null
    : t("2 a 32 caracteres: letras minúsculas, números, _ ou -, começando por letra.");
  const nameError = name.trim() ? null : t("Informe o nome.");
  const orderN = parseOrder(order);
  const orderError = orderN === null ? t("Inteiro de 0 a 1000.") : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (codeError || nameError || orderN === null) return;
    setError(null);
    try {
      await create.mutateAsync({
        code,
        name: name.trim(),
        description: description.trim() || null,
        features: [],
        limits: {},
        recommended: false,
        active,
        sort_order: orderN,
      });
      toast("success", t("Plano criado"), t("Edite recursos, limites e preços na lista."));
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <DialogContent
      mode="sheet"
      title={t("Criar plano")}
      description={t("Depois de criar, edite recursos, limites e preços.")}
    >
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <Field
          label={t("Código (não muda depois)")}
          htmlFor="new-plan-code"
          error={touched ? codeError : null}
        >
          <Input
            id="new-plan-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase())}
            autoCapitalize="none"
            spellCheck={false}
            invalid={touched && !!codeError}
          />
        </Field>
        <Field label={t("Nome")} htmlFor="new-plan-name" error={touched ? nameError : null}>
          <Input
            id="new-plan-name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            invalid={touched && !!nameError}
          />
        </Field>
        <Field label={t("Descrição")} htmlFor="new-plan-desc">
          <Textarea
            id="new-plan-desc"
            value={description}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label={t("Ordem")} htmlFor="new-plan-order" error={touched ? orderError : null}>
          <Input
            id="new-plan-order"
            inputMode="numeric"
            className="tnum"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            invalid={touched && !!orderError}
          />
        </Field>
        <label className="flex min-h-[44px] items-center gap-3 text-[14px]">
          <Switch checked={active} onCheckedChange={setActive} label={t("Ativo")} /> {t("Ativo desde já")}
        </label>
        {error ? <Banner kind="error">{error}</Banner> : null}
        <DialogActions>
          <Button type="button" variant="secondary" size="lg" onClick={onDone} disabled={create.isPending}>
            {t("Cancelar")}
          </Button>
          <Button type="submit" size="lg" loading={create.isPending}>
            {t("Criar plano")}
          </Button>
        </DialogActions>
      </form>
    </DialogContent>
  );
}
