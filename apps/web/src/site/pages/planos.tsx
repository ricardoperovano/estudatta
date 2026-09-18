import { Link } from "react-router";
import { Container } from "../layout";
import { Seo, pageMeta } from "../seo";
import { Card, CardBody, CardTitle } from "@/components/ui";
import { FaqSection } from "../sections/faq";
import { PlansSection, priceLabel, usePublicCatalog, type PublicPlan } from "../sections/plans";
import { WaitlistSection } from "../sections/waitlist";
import { brand } from "@/design/brand";

/** Linhas da comparação derivadas de `limits` do catálogo. Chave ausente nos dois planos = linha omitida. */
const limitRows: { key: string; label: string; format: (v: unknown) => string }[] = [
  { key: "max_active_activities", label: "Objetivos ativos", format: (v) => (v == null ? "Sem limite" : String(v)) },
  { key: "max_materials", label: "Materiais cadastrados", format: (v) => (v == null ? "Sem limite" : `Até ${String(v)}`) },
  { key: "materials_storage_mb", label: "Espaço para arquivos", format: (v) => (v == null ? "Sem limite" : fmtStorage(Number(v))) },
  { key: "recovery_distribution", label: "Recuperação distribuída nos próximos dias", format: yesNo },
  { key: "reports", label: "Relatórios", format: (v) => (v === "full" ? "Completos" : v === "basic" ? "Básicos" : String(v)) },
  { key: "reminders", label: "Lembretes", format: (v) => (v === "full" ? "Completos" : v === "basic" ? "Básicos" : String(v)) },
  { key: "csv_export", label: "Exportação do histórico em CSV", format: yesNo },
  { key: "ai_daily_actions", label: "Sugestões por IA (opcionais), por dia", format: (v) => (v == null ? "Sem limite" : Number(v) > 0 ? `Até ${String(v)}` : "Não incluídas") },
];

function yesNo(v: unknown) {
  return v ? "Sim" : "Não";
}
function fmtStorage(mb: number) {
  return mb >= 1024 ? `${String(Math.round((mb / 1024) * 10) / 10).replace(".", ",")} GB` : `${mb} MB`;
}

const clarifications = [
  { title: "Histórico e exportação nunca dependem de assinatura", text: "Tudo o que você registrou continua visível e exportável em qualquer plano, inclusive depois de cancelar. Os dados são seus." },
  { title: "Cancelamento sem obstáculos", text: "Você cancela na tela de planos, dentro do app. Sem ligação, sem formulário de retenção. O acesso ao Completo vai até o fim do período já pago." },
  { title: "Sem cobrança por minuto", text: "O preço não muda conforme o tempo de estudo, o número de sessões ou de lembretes. Estudar mais não custa mais." },
];

const billingFaq = [
  { q: "Preciso de cartão para começar?", a: "Não. A conta gratuita não pede forma de pagamento. Você só informa dados de pagamento se decidir assinar o plano Completo." },
  { q: "Quanto custa o plano Completo?", a: "O valor exibido nesta página vem direto do catálogo do serviço. Enquanto aparecer “Valor a definir”, a assinatura ainda não está aberta e nada é cobrado." },
  { q: "Quando o plano Completo é liberado depois do pagamento?", a: "Quando o provedor de pagamento confirma a cobrança. Voltar da página de pagamento, por si só, não libera o plano; a confirmação costuma chegar em instantes e o app atualiza sozinho." },
  { q: "Como cancelo? O que acontece depois?", a: "Na tela de planos do app, em poucos toques. Você continua com o Completo até o fim do período pago e depois volta ao Gratuito. Nada é apagado." },
  { q: "Se eu voltar ao Gratuito com vários objetivos, perco algum?", a: "Não. Nada é apagado. Se houver mais objetivos ativos do que o Gratuito permite, os mais recentes continuam ativos e os demais ficam pausados até você escolher. Histórico, materiais e exportação continuam disponíveis." },
  { q: "Existe cobrança por uso, por minuto ou por lembrete?", a: "Não. O plano tem um valor fixo por mês ou por ano, o que estiver no catálogo." },
  { q: "Há desconto, cupom ou promoção?", a: "Não anunciamos desconto nem promoção enquanto o preço não estiver definido. Se houver, o valor aparecerá aqui, vindo do catálogo." },
];

/** Planos: cartões com alternância mensal/anual, tabela Gratuito × Completo lida do catálogo público, esclarecimentos e FAQ de cobrança. */
export default function PlanosPage() {
  return (
    <>
      <Seo {...pageMeta["/planos"]} />
      <Container>
        <header className="flex flex-col gap-6 pb-12 pt-[clamp(56px,10vw,112px)]">
          <h1 className="max-w-[18ch] text-[clamp(40px,6vw,80px)] leading-[1.08] tracking-[-0.015em]">Comece grátis. Amplie quando precisar.</h1>
          <p className="max-w-[56ch] text-[17px] leading-[1.6] text-neutral-300">
            O plano Gratuito cobre um objetivo por inteiro: meta, sessões, saldo e recuperação. O Completo é para quem acompanha mais coisas ao mesmo tempo.
          </p>
        </header>
        <PlansSection full />
        <ComparisonTable />
        <section className="flex flex-col gap-6 pb-24" aria-labelledby="esclarecimentos-titulo">
          <span className="text-[13px] uppercase tracking-[0.06em] text-accent">Sem letras miúdas</span>
          <h2 id="esclarecimentos-titulo" className="max-w-[24ch] text-[32px] leading-[1.15]">O que vale em qualquer plano</h2>
          <div className="grid gap-4 tablet:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
            {clarifications.map((c) => (
              <Card key={c.title} className="gap-[10px] p-6">
                <CardTitle className="text-[20px]">{c.title}</CardTitle>
                <CardBody className="text-[15px]">{c.text}</CardBody>
              </Card>
            ))}
          </div>
        </section>
        <FaqSection items={billingFaq} title="Cobrança, cancelamento e seus dados" kicker="Perguntas sobre cobrança" />
        <p className="-mt-12 pb-16 text-[14px] text-neutral-400">
          Outra dúvida sobre pagamento? Escreva para <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a> ou use a página de <Link to="/contato">contato</Link>.
        </p>
        <div className="hr-fade" />
        <WaitlistSection />
      </Container>
    </>
  );
}

function ComparisonTable() {
  const catalog = usePublicCatalog();
  const plans = catalog.plans;
  const rows = limitRows.filter((r) => plans.some((p) => p.limits && r.key in p.limits));
  const cell = (p: PublicPlan, r: (typeof limitRows)[number]) => (p.limits && r.key in p.limits ? r.format(p.limits[r.key]) : "—");
  const maxFeatures = Math.max(0, ...plans.map((p) => p.features.length));
  return (
    <section className="flex flex-col gap-6 pb-24" aria-labelledby="comparacao-titulo">
      <span className="text-[13px] uppercase tracking-[0.06em] text-accent">Comparação</span>
      <h2 id="comparacao-titulo" className="text-[32px] leading-[1.15]">{plans.map((p) => p.name).join(" × ")}</h2>
      <div className="max-w-[820px] overflow-x-auto rounded-lg border border-divider bg-surface">
        <table className="w-full min-w-[480px] border-collapse text-left text-[14px]">
          <caption className="sr-only">Comparação entre os planos, conforme o catálogo do serviço</caption>
          <thead>
            <tr>
              <th scope="col" className="px-4 py-3 text-[12px] font-normal uppercase tracking-[0.06em] text-neutral-400">Recurso</th>
              {plans.map((p) => (
                <th key={p.code} scope="col" className={"px-4 py-3 text-[15px] font-medium " + (p.recommended ? "text-accent" : "")}>{p.name}</th>
              ))}
            </tr>
          </thead>
          <tbody className="tnum">
            <Row label="Valor mensal" values={plans.map((p) => priceLabel(p, "month"))} />
            <Row label="Valor anual" values={plans.map((p) => (p.code === "free" || p.prices.some((x) => x.interval === "year") ? priceLabel(p, "year") : "—"))} />
            {rows.map((r) => (
              <Row key={r.key} label={r.label} values={plans.map((p) => cell(p, r))} />
            ))}
            {Array.from({ length: maxFeatures }, (_, i) => (
              <Row key={`f${i}`} label={i === 0 ? "Incluído" : ""} values={plans.map((p) => p.features[i] ?? "")} />
            ))}
            <Row label="Histórico completo das sessões" values={plans.map(() => "Sim")} />
            <Row label="Exportação dos seus dados" values={plans.map(() => "Sim")} />
          </tbody>
        </table>
      </div>
      <p className="max-w-[64ch] text-[13px] text-neutral-500">Valores e limites vêm do catálogo do serviço e podem mudar; o que vale é o que aparece aqui e na tela de planos do app no momento da assinatura.</p>
    </section>
  );
}

function Row({ label, values }: { label: string; values: string[] }) {
  return (
    <tr className="border-t border-divider align-top">
      <th scope="row" className="px-4 py-3 font-normal text-neutral-300">{label}</th>
      {values.map((v, i) => (
        <td key={i} className="px-4 py-3">{v}</td>
      ))}
    </tr>
  );
}
