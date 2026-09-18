import * as React from "react";
import { Banner } from "@/components/ui";
import { Container } from "../layout";

/** Data fixa exibida nos documentos legais (privacidade e termos). */
export const LEGAL_UPDATED_AT = "18 de setembro de 2026";

/**
 * Marca uma informação empresarial ainda não definida (razão social, CNPJ, endereço, encarregado, foro).
 * Destaque em damasco, no estilo de <mark>, para que o responsável a localize com facilidade.
 */
export function Pending({ children = "a definir pelo responsável" }: { children?: React.ReactNode }) {
  return (
    <mark className="rounded-sm bg-warning-tint px-1 py-[1px] font-medium text-pending" data-pending>
      [{children}]
    </mark>
  );
}

/** Aviso no topo do documento listando o que ainda depende do responsável. */
export function PendingNotice({ items }: { items: string[] }) {
  return (
    <Banner kind="info" className="max-w-reading">
      <span className="font-medium">Informações pendentes do responsável.</span> Este documento descreve o comportamento implementado no serviço. Os itens abaixo aparecem marcados em damasco e devem ser preenchidos antes da publicação: {items.join("; ")}.
    </Banner>
  );
}

interface LegalDocProps {
  kicker: string;
  title: string;
  lead: string;
  pending: string[];
  toc: { id: string; label: string }[];
  children: React.ReactNode;
}

/** Estrutura dos documentos legais: cabeçalho, data, aviso de pendências, sumário e corpo com leitura de 58ch. */
export function LegalDoc({ kicker, title, lead, pending, toc, children }: LegalDocProps) {
  return (
    <Container className="pb-24 pt-[clamp(40px,7vw,80px)]">
      <header className="flex max-w-reading flex-col gap-4">
        <span className="text-[13px] uppercase tracking-[0.06em] text-accent">{kicker}</span>
        <h1 className="text-[clamp(32px,4.5vw,48px)] leading-[1.1] tracking-[-0.015em]">{title}</h1>
        <p className="text-[17px] leading-[1.6] text-neutral-300">{lead}</p>
        <p className="text-[13px] text-neutral-500">Última atualização: {LEGAL_UPDATED_AT}</p>
      </header>
      <div className="mt-8">
        <PendingNotice items={pending} />
      </div>
      <nav aria-label="Sumário" className="mt-10 max-w-reading">
        <span className="text-[13px] uppercase tracking-[0.06em] text-accent">Sumário</span>
        <ol className="tnum mt-3 flex list-decimal flex-col gap-1.5 pl-6 text-[14px] text-neutral-300">
          {toc.map((t) => (
            <li key={t.id}>
              <a href={`#${t.id}`} className="no-underline hover:underline">{t.label}</a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="mt-12 flex max-w-reading flex-col gap-12">{children}</div>
    </Container>
  );
}

/** Seção numerada (o número é passado explicitamente para coincidir com o sumário). */
export function LegalSection({ id, n, title, children }: { id: string; n: number; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="flex flex-col gap-4 scroll-mt-6">
      <h2 id={`${id}-titulo`} className="text-[24px] leading-[1.2]">
        <span className="tnum mr-3 text-accent">{String(n).padStart(2, "0")}</span>
        {title}
      </h2>
      <div className="flex flex-col gap-4 text-[15.5px] leading-[1.65] text-neutral-300 [&_strong]:font-medium [&_strong]:text-primary [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5">{children}</div>
    </section>
  );
}

export function LegalSub({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-2 text-[17px] font-medium leading-[1.3] text-primary">{children}</h3>;
}
