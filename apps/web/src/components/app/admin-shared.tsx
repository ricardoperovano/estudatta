/** Peças comuns das telas do painel administrativo. */
import * as React from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { errorMessage } from "@/api/client";
import { Banner, Button, Card, Input, Spinner } from "@/components/ui";
import { fmtValue, humanize, isPlainObject } from "@/components/app/admin-format";
import { cn } from "@/lib/utils";

export function AdminTitle({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <span className="kicker">Painel administrativo</span>
        <h1 className="text-[25px] leading-[1.15] desktop:text-[32px] desktop:leading-[1.1]">{title}</h1>
        {subtitle ? <p className="mt-1 text-[13px] text-neutral-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Carregando / erro com "Tentar de novo" / conteúdo. */
export function QueryGate<T>({ query, children }: { query: UseQueryResult<T>; children: (data: T) => React.ReactNode }) {
  if (query.data !== undefined) {
    return (
      <>
        {query.isError ? (
          <Banner
            kind="error"
            actions={
              <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
                Tentar de novo
              </Button>
            }
          >
            Não foi possível atualizar: {errorMessage(query.error)}
          </Banner>
        ) : null}
        {children(query.data)}
      </>
    );
  }
  if (query.isError) {
    return (
      <Banner
        kind="error"
        actions={
          <Button variant="secondary" size="lg" loading={query.isFetching} onClick={() => void query.refetch()}>
            Tentar de novo
          </Button>
        }
      >
        {errorMessage(query.error)}
      </Banner>
    );
  }
  return (
    <div className="flex items-center gap-2 p-6 text-[14px] text-neutral-400">
      <Spinner /> Carregando…
    </div>
  );
}

export function AdminSection({ title, meta, children, className }: { title: string; meta?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card as="section" className={cn("gap-3 p-4 desktop:p-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[17px] font-medium leading-[1.2]">{title}</h2>
        {meta ? <div className="flex flex-wrap items-center gap-2 text-[12px] text-neutral-400">{meta}</div> : null}
      </div>
      {children}
    </Card>
  );
}

/** Dicionário livre → lista rótulo/valor (objetos aninhados viram sub-listas). */
export function KeyValues({ data, className }: { data: Record<string, unknown>; className?: string }) {
  const entries = Object.entries(data);
  if (!entries.length) return <span className="text-[13px] text-neutral-400">Sem dados.</span>;
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-2 tablet:grid-cols-2", className)}>
      {entries.map(([k, v]) => (
        <div key={k} className={cn("flex min-w-0 justify-between gap-3 border-b border-divider pb-2 text-[13px]", isPlainObject(v) && "flex-col tablet:col-span-2")}>
          <dt className="shrink-0 text-neutral-400">{humanize(k)}</dt>
          {isPlainObject(v) ? (
            <dd className="pl-3">
              <KeyValues data={v} />
            </dd>
          ) : (
            <dd className="tnum min-w-0 break-words text-right">{fmtValue(v)}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}

export function StatCard({ label, value, children }: { label: string; value?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Card className="gap-2 p-4">
      <span className="kicker">{label}</span>
      {value !== undefined ? <span className="tnum text-[28px] font-medium leading-none">{value}</span> : null}
      {children}
    </Card>
  );
}

interface PagerProps {
  total?: number | null;
  limit: number;
  offset: number;
  count: number;
  busy?: boolean;
  onChange: (offset: number) => void;
}

export function Pager({ total, limit, offset, count, busy, onChange }: PagerProps) {
  const hasPrev = offset > 0;
  const hasNext = total != null ? offset + limit < total : count >= limit;
  if (!hasPrev && !hasNext) {
    return total != null ? <span className="tnum text-[12px] text-neutral-400">{total.toLocaleString("pt-BR")} no total</span> : null;
  }
  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-2">
      <span className="tnum flex items-center gap-2 text-[12px] text-neutral-400">
        {count ? `${offset + 1}–${offset + count}` : "0"}
        {total != null ? ` de ${total.toLocaleString("pt-BR")}` : ""}
        {busy ? <Spinner /> : null}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" size="lg" disabled={!hasPrev} onClick={() => onChange(Math.max(0, offset - limit))}>
          Anterior
        </Button>
        <Button variant="secondary" size="lg" disabled={!hasNext} onClick={() => onChange(offset + limit)}>
          Próxima
        </Button>
      </div>
    </nav>
  );
}

/** Campo de busca que só avisa o pai depois de 350 ms sem digitar. */
export function SearchInput({ onCommit, placeholder, label, initial = "" }: { onCommit: (v: string) => void; placeholder?: string; label: string; initial?: string }) {
  const [text, setText] = React.useState(initial);
  React.useEffect(() => {
    const t = window.setTimeout(() => onCommit(text.trim()), 350);
    return () => window.clearTimeout(t);
  }, [text, onCommit]);
  return (
    <div className="relative w-full tablet:max-w-[360px]">
      <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
      <Input type="search" aria-label={label} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} className="pl-9" />
    </div>
  );
}

export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-[60dvh] overflow-auto rounded-md border border-divider bg-canvas p-3 text-[12px] leading-[1.5]">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
