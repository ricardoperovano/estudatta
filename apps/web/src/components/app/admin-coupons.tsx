/** Painel administrativo — cupons (desconto % na assinatura ou dias grátis de um plano). */
import * as React from "react";
import { Plus } from "@phosphor-icons/react";
import { useAdminPlans } from "@/api/admin";
import {
  useAdminCoupons,
  useCreateCoupon,
  useToggleCoupon,
  type Coupon,
  type CouponIn,
} from "@/api/admin-growth";
import { errorMessage } from "@/api/client";
import { fmtDate } from "@/components/app/admin-format";
import { COUPON_CODE_RE, couponSummary, endOfDayIso } from "@/components/app/admin-growth-format";
import { AdminSection, AdminTitle, QueryGate } from "@/components/app/admin-shared";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  EmptyState,
  Field,
  Input,
  Select,
  Tag,
  Textarea,
  toast,
} from "@/components/ui";

type Kind = CouponIn["kind"];

const KIND_LABEL: Record<Kind, string> = {
  percent: "Desconto % na assinatura",
  trial: "Dias grátis de um plano",
};

function couponState(c: Coupon): { label: string; variant: "success" | "neutral" | "error" | "pending" } {
  if (!c.active) return { label: "Desativado", variant: "neutral" };
  if (c.valid) return { label: "Válido", variant: "success" };
  if (c.expires_at && new Date(c.expires_at).getTime() <= Date.now())
    return { label: "Expirado", variant: "error" };
  if (c.max_uses != null && c.uses >= c.max_uses) return { label: "Esgotado", variant: "pending" };
  return { label: "Inválido", variant: "error" };
}

export function AdminCouponsPage() {
  const coupons = useAdminCoupons();
  const [createOpen, setCreateOpen] = React.useState(false);

  return (
    <div className="flex flex-col gap-[14px] desktop:gap-6">
      <AdminTitle
        title="Cupons"
        subtitle="Quem digita o código em Planos ganha o benefício. Cada pessoa usa um cupom só uma vez."
        actions={
          <Button size="lg" onClick={() => setCreateOpen(true)}>
            <Plus size={16} aria-hidden /> Novo cupom
          </Button>
        }
      />

      <AdminSection
        title="Todos os cupons"
        meta={
          coupons.data ? (
            <span className="tnum">{coupons.data.length.toLocaleString("pt-BR")} no total</span>
          ) : null
        }
      >
        <QueryGate query={coupons}>
          {(list) =>
            list.length === 0 ? (
              <EmptyState
                title="Nenhum cupom ainda."
                description="Crie um cupom de desconto ou de dias grátis para usar em campanhas ou divulgar."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-[0.1em] text-neutral-400">
                      <th scope="col" className="py-2 pr-3 font-normal">
                        Código
                      </th>
                      <th scope="col" className="py-2 pr-3 font-normal">
                        Tipo
                      </th>
                      <th scope="col" className="py-2 pr-3 font-normal">
                        Valor
                      </th>
                      <th scope="col" className="py-2 pr-3 font-normal">
                        Plano
                      </th>
                      <th scope="col" className="py-2 pr-3 font-normal">
                        Usos
                      </th>
                      <th scope="col" className="py-2 pr-3 font-normal">
                        Validade
                      </th>
                      <th scope="col" className="py-2 pr-3 font-normal">
                        Situação
                      </th>
                      <th scope="col" className="py-2 font-normal">
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((c) => (
                      <CouponRow key={c.id} c={c} />
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </QueryGate>
      </AdminSection>

      <CouponCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function CouponRow({ c }: { c: Coupon }) {
  const toggle = useToggleCoupon();
  const state = couponState(c);
  const doToggle = async () => {
    try {
      const r = await toggle.mutateAsync(c.id);
      toast("success", r.active ? "Cupom ativado" : "Cupom desativado", r.code);
    } catch (e) {
      toast("error", "Não foi possível alterar o cupom", errorMessage(e));
    }
  };
  return (
    <tr className="border-t border-divider align-top">
      <td className="py-2 pr-3">
        <code className="text-[14px] font-medium">{c.code}</code>
        {c.note ? (
          <span className="block max-w-[260px] truncate text-[12px] text-neutral-400">{c.note}</span>
        ) : null}
      </td>
      <td className="py-2 pr-3">
        {c.kind === "percent" ? "Desconto %" : c.kind === "trial" ? "Dias grátis" : c.kind}
      </td>
      <td className="tnum whitespace-nowrap py-2 pr-3">
        {c.kind === "percent" ? `${c.value}%` : `${c.value} dias`}
      </td>
      <td className="py-2 pr-3">{c.plan_code ?? "qualquer"}</td>
      <td className="tnum whitespace-nowrap py-2 pr-3">
        {c.uses.toLocaleString("pt-BR")} / {c.max_uses != null ? c.max_uses.toLocaleString("pt-BR") : "∞"}
      </td>
      <td className="tnum whitespace-nowrap py-2 pr-3">
        {c.expires_at ? fmtDate(c.expires_at) : "sem prazo"}
      </td>
      <td className="py-2 pr-3">
        <Tag variant={state.variant}>{state.label}</Tag>
      </td>
      <td className="py-2">
        <div className="flex justify-end">
          <Button
            variant={c.active ? "danger" : "primary"}
            size="md"
            loading={toggle.isPending}
            onClick={() => void doToggle()}
          >
            {c.active ? "Desativar" : "Ativar"}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function CouponCreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const plans = useAdminPlans();
  const create = useCreateCoupon();
  const [code, setCode] = React.useState("");
  const [kind, setKind] = React.useState<Kind>("percent");
  const [value, setValue] = React.useState("20");
  const [planCode, setPlanCode] = React.useState("");
  const [maxUses, setMaxUses] = React.useState("");
  const [expires, setExpires] = React.useState("");
  const [note, setNote] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  const planOptions = (plans.data ?? []).filter((p) => p.active && p.code !== "free");
  const valueN = /^\d+$/.test(value) ? Number(value) : NaN;
  const codeError = COUPON_CODE_RE.test(code) ? null : "3 a 32 caracteres: letras, números, - ou _.";
  const valueError =
    kind === "percent"
      ? Number.isInteger(valueN) && valueN >= 1 && valueN <= 100
        ? null
        : "Desconto entre 1% e 100%."
      : Number.isInteger(valueN) && valueN >= 1 && valueN <= 3650
        ? null
        : "Entre 1 e 3650 dias.";
  const planError = kind === "trial" && !planCode ? "Dias grátis precisam de um plano." : null;
  const maxUsesN = maxUses.trim() === "" ? null : /^\d+$/.test(maxUses) ? Number(maxUses) : NaN;
  const maxUsesError =
    maxUsesN === null || (Number.isInteger(maxUsesN) && maxUsesN >= 1)
      ? null
      : "Deixe vazio para ilimitado ou informe um número inteiro.";
  const expiresIso = expires ? endOfDayIso(expires) : null;
  const expiresError = expires && !expiresIso ? "Data inválida." : null;
  const noteError = note.length > 300 ? "Máximo de 300 caracteres." : null;

  const reset = () => {
    setCode("");
    setKind("percent");
    setValue("20");
    setPlanCode("");
    setMaxUses("");
    setExpires("");
    setNote("");
    setTouched(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (codeError || valueError || planError || maxUsesError || expiresError || noteError) return;
    try {
      const c = await create.mutateAsync({
        code,
        kind,
        value: valueN,
        plan_code: planCode || null,
        max_uses: maxUsesN,
        expires_at: expiresIso,
        note: note.trim() || null,
      });
      toast("success", "Cupom criado", `${c.code}: ${couponSummary(c)}.`);
      reset();
      onOpenChange(false);
    } catch (err) {
      toast("error", "Não foi possível criar o cupom", errorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mode="sheet"
        title="Novo cupom"
        description="O código é o que a pessoa digita em Planos. Depois de criado, só dá para ativar ou desativar."
      >
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          <Field
            label="Código"
            htmlFor="coupon-code"
            error={touched ? codeError : null}
            hint="Maiúsculas automáticas. 3 a 32 caracteres: letras, números, - ou _."
          >
            <Input
              id="coupon-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
              invalid={touched && !!codeError}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="VOLTA20"
              maxLength={32}
              className="font-mono uppercase"
            />
          </Field>

          <Field
            label="Tipo"
            htmlFor="coupon-kind"
            hint={
              kind === "percent"
                ? "Reduz o valor da assinatura no checkout e o desconto vale em todos os ciclos enquanto a assinatura durar (ex.: 20% em R$ 19,90 = R$ 15,92 por mês). Não afeta quem já assina."
                : "Libera o plano escolhido por alguns dias sem cobrança, como uma concessão promocional. Ao terminar, a pessoa volta ao plano gratuito, sem cobrança automática."
            }
          >
            <Select
              id="coupon-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value === "trial" ? "trial" : "percent")}
            >
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2">
            <Field
              label={kind === "percent" ? "Desconto (%)" : "Dias grátis"}
              htmlFor="coupon-value"
              error={touched ? valueError : null}
            >
              <Input
                id="coupon-value"
                inputMode="numeric"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                invalid={touched && !!valueError}
                className="tnum"
              />
            </Field>
            <Field
              label={kind === "trial" ? "Plano (obrigatório)" : "Plano (opcional)"}
              htmlFor="coupon-plan"
              error={touched ? planError : null}
              hint={kind === "percent" ? "Vazio = vale para qualquer plano pago." : undefined}
            >
              <Select
                id="coupon-plan"
                value={planCode}
                onChange={(e) => setPlanCode(e.target.value)}
                invalid={touched && !!planError}
                disabled={plans.isLoading}
              >
                <option value="">
                  {plans.isLoading ? "Carregando…" : kind === "trial" ? "Escolha…" : "Qualquer plano"}
                </option>
                {planOptions.map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2">
            <Field
              label="Limite de usos"
              htmlFor="coupon-max"
              error={touched ? maxUsesError : null}
              hint="Vazio = ilimitado."
            >
              <Input
                id="coupon-max"
                inputMode="numeric"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                invalid={touched && !!maxUsesError}
                className="tnum"
                placeholder="∞"
              />
            </Field>
            <Field
              label="Válido até"
              htmlFor="coupon-expires"
              error={touched ? expiresError : null}
              hint="Vale até o fim desse dia. Vazio = sem prazo."
            >
              <Input
                id="coupon-expires"
                type="date"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
                invalid={touched && !!expiresError}
                className="tnum"
              />
            </Field>
          </div>

          <Field
            label="Observação (só para o painel)"
            htmlFor="coupon-note"
            error={touched ? noteError : null}
          >
            <Textarea
              id="coupon-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              className="min-h-[64px]"
              placeholder="Ex.: campanha de volta às aulas"
            />
          </Field>

          <DialogActions>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" size="lg" loading={create.isPending}>
              Criar cupom
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
