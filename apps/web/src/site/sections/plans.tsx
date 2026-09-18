import * as React from "react";
import { Link } from "react-router";
import { Button, Card, Tag } from "@/components/ui";
import { rawJson } from "@/api/client";
import { fmtBRL } from "@/lib/format";

export interface PublicPlan {
  code: string;
  name: string;
  description?: string | null;
  features: string[];
  limits: Record<string, unknown>;
  recommended: boolean;
  prices: { interval: "month" | "year"; amount_cents: number | null; currency: string }[];
}
export interface PublicCatalog {
  plans: PublicPlan[];
  billing_mode: "disabled" | "test" | "production";
}

/** Catálogo padrão exibido na pré-renderização e enquanto o servidor não responde (preço nulo = "Valor a definir"). */
export const fallbackCatalog: PublicCatalog = {
  billing_mode: "disabled",
  plans: [
    { code: "free", name: "Gratuito", features: ["1 objetivo ativo", "Cronômetro e registro manual", "Plano semanal e pendências", "Lembretes no navegador"], limits: {}, recommended: false, prices: [{ interval: "month", amount_cents: 0, currency: "BRL" }] },
    { code: "pro", name: "Completo", features: ["Objetivos ilimitados", "Recuperação distribuída e replanejamento", "Relatórios mensais e exportação", "Materiais com intervalo de páginas", "Tema claro e escuro"], limits: {}, recommended: true, prices: [{ interval: "month", amount_cents: null, currency: "BRL" }, { interval: "year", amount_cents: null, currency: "BRL" }] },
  ],
};

export function usePublicCatalog() {
  const [catalog, setCatalog] = React.useState<PublicCatalog>(fallbackCatalog);
  React.useEffect(() => {
    rawJson<PublicCatalog>("/api/v1/public/plans")
      .then((c) => c && Array.isArray(c.plans) && c.plans.length && setCatalog(c))
      .catch(() => {});
  }, []);
  return catalog;
}

export function priceLabel(plan: PublicPlan, interval: "month" | "year") {
  if (plan.code === "free") return "R$ 0";
  const p = plan.prices.find((x) => x.interval === interval) || plan.prices[0];
  return p ? fmtBRL(p.amount_cents) : "Valor a definir";
}

export function PlansSection({ full = false }: { full?: boolean }) {
  const catalog = usePublicCatalog();
  const [interval, setInterval_] = React.useState<"month" | "year">("month");
  return (
    <section id="planos" className="flex flex-col gap-6 pb-24">
      <span className="text-[13px] uppercase tracking-[0.06em] text-accent">Planos</span>
      {full ? (
        <div className="inline-flex self-start overflow-hidden rounded-md border border-divider text-[13px]">
          {(["month", "year"] as const).map((i) => (
            <button key={i} type="button" onClick={() => setInterval_(i)} className={"px-3 py-[7px] " + (interval === i ? "text-accent shadow-inset-accent" : "text-primary")}>
              {i === "month" ? "Mensal" : "Anual"}
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid max-w-[820px] gap-4 tablet:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
        {catalog.plans.map((p) => (
          <Card key={p.code} className="gap-3 p-6" accent={p.recommended}>
            <div className="flex items-center justify-between">
              <span className={"text-[20px] font-medium " + (p.recommended ? "text-accent" : "")}>{p.name}</span>
              {p.recommended ? <Tag variant="accent" icon={false}>Recomendado</Tag> : null}
            </div>
            <span className="text-[32px] font-medium">
              {priceLabel(p, interval)}
              {p.code !== "free" ? <span className="text-[14px] font-normal text-neutral-400"> / {interval === "year" ? "ano" : "mês"}</span> : null}
            </span>
            <ul className="flex list-disc flex-col gap-1.5 pl-[18px] text-[14px] text-neutral-300">
              {p.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <Button asChild variant={p.recommended ? "primary" : "secondary"} size="lg" className="mt-2">
              <Link to="/cadastro">{p.code === "free" ? "Começar grátis" : catalog.billing_mode === "disabled" || priceLabel(p, interval) === "Valor a definir" ? "Avisar quando abrir" : "Assinar"}</Link>
            </Button>
          </Card>
        ))}
      </div>
      <p className="text-[13px] text-neutral-500">Sem desconto, promoção ou garantia enquanto o preço não estiver definido. Histórico e exportação dos seus dados nunca dependem de assinatura.</p>
    </section>
  );
}
