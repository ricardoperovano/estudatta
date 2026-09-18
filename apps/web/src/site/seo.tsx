import * as React from "react";
import { brand } from "@/design/brand";

interface SeoProps {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
}

/** Título, descrição, canonical e Open Graph por página (aplicado no cliente e na pré-renderização). */
export function Seo({ title, description, path, noindex }: SeoProps) {
  const full = title.includes(brand.name) ? title : `${title} · ${brand.name}`;
  const url = `${brand.siteUrl}${path}`;
  const image = `${brand.siteUrl}${brand.ogImage}`;
  React.useEffect(() => {
    document.title = full;
    setMeta("name", "description", description);
    setMeta("property", "og:title", full);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", url);
    setMeta("property", "og:image", image);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:locale", "pt_BR");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow");
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = url;
  }, [full, description, url, image, noindex]);
  return null;
}

function setMeta(attr: "name" | "property", key: string, value: string) {
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

/** Usado pela pré-renderização para montar o <head> estático. */
export function headTags({ title, description, path, noindex }: SeoProps): string {
  const full = title.includes(brand.name) ? title : `${title} · ${brand.name}`;
  const url = `${brand.siteUrl}${path}`;
  const image = `${brand.siteUrl}${brand.ogImage}`;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return [
    `<title>${esc(full)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta name="robots" content="${noindex ? "noindex, nofollow" : "index, follow"}">`,
    `<meta property="og:title" content="${esc(full)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="pt_BR">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join("\n    ");
}

export const pageMeta: Record<string, SeoProps> = {
  "/": { title: "Estudatta — Saiba o que fazer hoje. Retome quando atrasar.", description: brand.description, path: "/" },
  "/ingles": { title: "Inglês e idiomas", description: "60 minutos por dia. Mesmo depois de ontem. Acompanhe o tempo de estudo de inglês e retome o plano quando atrasar.", path: "/ingles" },
  "/concursos": { title: "Concursos", description: "Edital longo. Plano do dia curto. Matérias, tópicos, PDFs com intervalo de páginas e tempo a recuperar.", path: "/concursos" },
  "/planos": { title: "Planos", description: "Comece grátis com um objetivo. Amplie quando precisar acompanhar mais coisas ao mesmo tempo.", path: "/planos" },
  "/faq": { title: "Perguntas frequentes", description: "O que o Estudatta faz e o que não faz.", path: "/faq" },
  "/contato": { title: "Contato", description: "Fale com a equipe do Estudatta.", path: "/contato" },
  "/privacidade": { title: "Privacidade", description: "Como o Estudatta trata seus dados.", path: "/privacidade" },
  "/termos": { title: "Termos de uso", description: "Termos de uso do Estudatta.", path: "/termos" },
};
