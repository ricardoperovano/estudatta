/** Configuração de marca centralizada (nome, logos, cores, URLs). Já preenchida com Estudatta. */

import { t } from "@/i18n";
export const brand = {
  name: "Estudatta",
  tagline: t("Saiba o que fazer hoje. Retome quando atrasar."),
  positioning: t(
    "O planejador de estudo e prática que mostra o que fazer hoje e como retomar quando o plano atrasa.",
  ),
  description: t(
    "Você define meta, dias e horários. O Estudatta organiza o plano, registra as sessões e transforma o que faltou em tempo a recuperar — no seu ritmo, sem culpa.",
  ),
  domain: "estudatta.com.br",
  /** Site público (repositório separado). Em dev: http://localhost:5190 via VITE_SITE_URL. */
  siteUrl:
    (import.meta.env.VITE_SITE_URL as string | undefined) ||
    (import.meta.env.DEV ? "http://localhost:5190" : "https://estudatta.com.br"),
  supportEmail: "contato@estudatta.com.br",
  colors: {
    accentDark: "#9184d9",
    accentLight: "#5d5294",
    canvasDark: "#161826",
    canvasLight: "#f3f5fe",
    pending: "#d9a86a",
  },
  /** Logo nova (arquivos gerados por estudatta-site/scripts/gerar-logos.sh). */
  logos: {
    escuro: "/marca/logo-escuro-128.png",
    claro: "/marca/logo-claro-128.png",
  },
  campaigns: {
    ingles: t("60 minutos por dia. Mesmo depois de ontem."),
    concursos: t("Edital longo. Plano do dia curto."),
    rotina: t("Atrasou ontem? Hoje dá para retomar."),
  },
  signatures: [
    t("Saiba o que fazer hoje."),
    t("Retome de onde parou."),
    t("Um plano que aguenta a vida real."),
  ],
} as const;

/** Link absoluto para uma página do site público (termos, privacidade, planos…). */
export function siteLink(path: string): string {
  return brand.siteUrl.replace(/\/$/, "") + path;
}
