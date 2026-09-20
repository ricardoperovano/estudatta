/** Rótulos, regras e modelos das telas de crescimento do painel (sem JSX). */
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { components } from "@/api/schema";
import type { TagVariant } from "@/components/app/admin-format";
import { parseDate } from "@/lib/format";

/** "10 out" (sem hora; "—" quando vazio). */
export function fmtDay(d: string | null | undefined): string {
  return d ? format(parseDate(d), "d MMM", { locale: ptBR }).replace(".", "") : "—";
}

type CouponLike = Pick<components["schemas"]["CouponOut"], "kind" | "value" | "plan_code">;

// --- Assinaturas ------------------------------------------------------------------------------

export const SUB_STATUS: Record<string, { label: string; variant: TagVariant }> = {
  pending: { label: "Pendente", variant: "pending" },
  active: { label: "Ativa", variant: "success" },
  past_due: { label: "Em atraso", variant: "error" },
  paused: { label: "Pausada", variant: "neutral" },
  cancelled: { label: "Cancelada", variant: "neutral" },
  canceled: { label: "Cancelada", variant: "neutral" },
  expired: { label: "Encerrada", variant: "neutral" },
};

/** "Cancelada (acesso até 30 set, 23:59)" enquanto o período pago ainda não terminou. */
export function subscriptionStatusLabel(
  s: string,
  periodEnd?: string | null,
  now: number = Date.now(),
): string {
  const base = SUB_STATUS[s]?.label ?? s;
  if ((s === "cancelled" || s === "canceled") && periodEnd && new Date(periodEnd).getTime() > now)
    return `${base} (acesso até ${fmtDay(periodEnd)})`;
  return base;
}

// --- Cupons -----------------------------------------------------------------------------------

/** Mesma regra do servidor: 3 a 32 caracteres, maiúsculas, dígitos, - ou _. */
export const COUPON_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

export function couponSummary(c: CouponLike): string {
  if (c.kind === "percent") return `${c.value}% de desconto${c.plan_code ? ` no ${c.plan_code}` : ""}`;
  return `${c.value} dias grátis do ${c.plan_code ?? "plano"}`;
}

/** "2026-12-31" (fuso local) → ISO no fim do dia. */
export function endOfDayIso(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 23, 59, 59, 999);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

// --- Campanhas --------------------------------------------------------------------------------

export interface CampaignTemplate {
  key: string;
  label: string;
  subject: string;
  body: (hasCoupon: boolean) => string;
}

export const TEMPLATES: CampaignTemplate[] = [
  {
    key: "tips",
    label: "Dicas de estudo",
    subject: "{nome}, 3 hábitos que fazem o estudo render mais",
    body: () =>
      [
        "Oi, {nome}!",
        "Separamos três hábitos simples que fazem diferença em quem estuda com constância:",
        "1. Revise no dia certo. O Estudatta agenda as revisões de cada tópico nos intervalos em que a memória mais precisa delas. Marcar como feita leva segundos e o assunto fica.",
        "2. Registre o que estudou, mesmo depois. Esqueceu de dar play no cronômetro? Registre a sessão depois, com o tempo aproximado. O que importa é o histórico refletir a sua semana de verdade.",
        "3. Planeje as pausas. Descanso combinado não é falta de disciplina: é parte do plano. Marque os dias de folga no calendário e o app redistribui o que faltar.",
        "Bons estudos!",
      ].join("\n\n"),
  },
  {
    key: "comeback",
    label: "Volte a estudar",
    subject: "{nome}, o seu plano está guardado aqui",
    body: (hasCoupon) =>
      [
        "Oi, {nome}!",
        "Faz um tempinho que você não aparece por aqui, e tudo bem. A vida tem semanas mais cheias. O seu plano, as suas revisões e o histórico continuam guardados, do jeito que você deixou.",
        "Se quiser retomar, não precisa recuperar nada: abra o app, registre uma sessão curta hoje e o Estudatta reorganiza o resto a partir daí.",
        hasCoupon
          ? "E para facilitar a volta, separamos um cupom para você: {cupom}. É só digitar em Planos."
          : null,
        "Estamos por aqui quando fizer sentido para você.",
      ]
        .filter(Boolean)
        .join("\n\n"),
  },
  {
    key: "discount",
    label: "Desconto especial",
    subject: "{nome}, um desconto para você estudar com tudo",
    body: () =>
      [
        "Oi, {nome}!",
        "Separamos um cupom especial para você: {cupom}.",
        "Com ele, você assina com desconto e libera planejamento automático, relatórios completos e mais espaço para os seus materiais.",
        "Para usar, entre em Planos, digite o código {cupom} e confirme. O desconto aparece antes de você pagar.",
        "Qualquer dúvida, é só responder este e-mail.",
      ].join("\n\n"),
  },
];

/** Renderiza {nome} e {cupom} como o servidor faz (nome de exemplo no painel). */
export function renderPreview(text: string, name: string, coupon: string): string {
  return text.replaceAll("{nome}", name).replaceAll("{cupom}", coupon);
}

/** Destino padrão do botão: o app, ou Planos com o cupom preenchido. */
export function defaultCtaUrl(origin: string, coupon: string): string {
  return coupon ? `${origin}/app/planos?cupom=${encodeURIComponent(coupon)}` : `${origin}/app`;
}
