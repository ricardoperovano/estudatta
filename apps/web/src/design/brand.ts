/** Configuração de marca centralizada (nome, logos, cores, URLs). Já preenchida com Estudatta. */
import simbolo from "@/assets/marca/simbolo.svg";
import simboloFundoClaro from "@/assets/marca/simbolo-fundo-claro.svg";
import simboloMonoClaro from "@/assets/marca/simbolo-mono-claro.svg";
import simboloMonoEscuro from "@/assets/marca/simbolo-mono-escuro.svg";
import logoHorizontalEscuro from "@/assets/marca/logo-horizontal-fundo-escuro.svg";
import logoHorizontalClaro from "@/assets/marca/logo-horizontal-fundo-claro.svg";
import logoVerticalEscuro from "@/assets/marca/logo-vertical-fundo-escuro.svg";
import logoVerticalClaro from "@/assets/marca/logo-vertical-fundo-claro.svg";

export const brand = {
  name: "Estudatta",
  tagline: "Saiba o que fazer hoje. Retome quando atrasar.",
  positioning:
    "O planejador de estudo e prática que mostra o que fazer hoje e como retomar quando o plano atrasa.",
  description:
    "Você define meta, dias e horários. O Estudatta organiza o plano, registra as sessões e transforma o que faltou em tempo a recuperar — no seu ritmo, sem culpa.",
  domain: "estudatta.com.br",
  /** Site público (repositório separado). Em dev: http://localhost:5190 via VITE_SITE_URL. */
  siteUrl: (import.meta.env.VITE_SITE_URL as string | undefined) || (import.meta.env.DEV ? "http://localhost:5190" : "https://estudatta.com.br"),
  supportEmail: "contato@estudatta.com.br",
  colors: {
    accentDark: "#9184d9",
    accentLight: "#5d5294",
    canvasDark: "#161826",
    canvasLight: "#f3f5fe",
    pending: "#d9a86a",
  },
  logos: {
    simbolo,
    simboloFundoClaro,
    simboloMonoClaro,
    simboloMonoEscuro,
    horizontalEscuro: logoHorizontalEscuro,
    horizontalClaro: logoHorizontalClaro,
    verticalEscuro: logoVerticalEscuro,
    verticalClaro: logoVerticalClaro,
  },
  campaigns: {
    ingles: "60 minutos por dia. Mesmo depois de ontem.",
    concursos: "Edital longo. Plano do dia curto.",
    rotina: "Atrasou ontem? Hoje dá para retomar.",
  },
  signatures: ["Saiba o que fazer hoje.", "Retome de onde parou.", "Um plano que aguenta a vida real."],
  ogImage: "/divulgacao/capa-compartilhamento-1200x630.png",
} as const;

/** Link absoluto para uma página do site público (termos, privacidade, planos…). */
export function siteLink(path: string): string {
  return brand.siteUrl.replace(/\/$/, "") + path;
}
