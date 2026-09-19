/**
 * Mini-ilustrações dos elementos que a pessoa procura na tela do navegador (botão Compartilhar,
 * menu ⋮, "Adicionar à Tela de Início"...). São decorativas: o texto do passo já diz tudo.
 */
import * as React from "react";
import {
  BookOpen,
  CaretLeft,
  CaretRight,
  Export,
  House,
  List,
  LockSimple,
  SquaresFour,
  Star,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/** Moldura das ilustrações: um pedacinho da tela do aparelho. */
export function Mock({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none select-none rounded-lg border border-divider bg-canvas p-2 text-primary", className)}>
      {children}
    </div>
  );
}

/** O elemento que a pessoa deve tocar: contorno acento e um brilho suave. */
function Hi({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("relative inline-flex items-center justify-center rounded-md bg-accent-tint text-accent ring-2 ring-accent", className)}>
      <span className="absolute -inset-1 rounded-[10px] ring-2 ring-[color-mix(in_srgb,var(--color-action-primary)_30%,transparent)] motion-safe:animate-pulse" />
      {children}
    </span>
  );
}

function Dim({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center justify-center text-neutral-500", className)}>{children}</span>;
}

const IC = 18;

/** Barra de baixo do Safari no iPhone, com Compartilhar em destaque. */
export function SafariToolbar() {
  return (
    <Mock>
      <div className="mb-2 flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-[11px] text-neutral-500">
        <LockSimple size={10} /> estudatta.com.br
      </div>
      <div className="flex items-center justify-between px-1">
        <Dim><CaretLeft size={IC} /></Dim>
        <Dim><CaretRight size={IC} /></Dim>
        <Hi className="h-8 w-8"><Export size={IC} weight="bold" /></Hi>
        <Dim><BookOpen size={IC} /></Dim>
        <Dim><SquaresFour size={IC} /></Dim>
      </div>
    </Mock>
  );
}

/** Barra de endereço com um ícone em destaque à direita (Compartilhar, ⋮, instalar...). */
export function AddressBar({ icon, extra }: { icon: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <Mock>
      <div className="flex items-center gap-2">
        <Dim><House size={16} /></Dim>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-surface px-2.5 py-1.5 text-[11px] text-neutral-500">
          <LockSimple size={10} className="shrink-0" />
          <span className="truncate">estudatta.com.br/app</span>
          {extra}
        </div>
        <Hi className="h-8 w-8 shrink-0">{icon}</Hi>
      </div>
    </Mock>
  );
}


/** Barra de baixo do Samsung Internet, com o menu ≡ em destaque. */
export function SamsungToolbar() {
  return (
    <Mock>
      <div className="flex items-center justify-between px-1">
        <Dim><CaretLeft size={IC} /></Dim>
        <Dim><CaretRight size={IC} /></Dim>
        <Dim><House size={IC} /></Dim>
        <Dim><Star size={IC} /></Dim>
        <Dim><SquaresFour size={IC} /></Dim>
        <Hi className="h-8 w-8"><List size={IC} weight="bold" /></Hi>
      </div>
    </Mock>
  );
}

/** Lista de opções (folha de compartilhar ou menu) com uma linha em destaque. */
export function MenuRows({ rows, highlight, highlightIcon }: { rows: [string, React.ReactNode][]; highlight: string; highlightIcon: React.ReactNode }) {
  return (
    <Mock className="p-1.5">
      <ul className="flex flex-col gap-1 text-[12px]">
        {rows.map(([label, icon]) => (
          <li key={label} className="flex items-center justify-between rounded-md px-2 py-1.5 text-neutral-500">
            <span className="truncate">{label}</span>
            <span className="shrink-0">{icon}</span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-2 rounded-md bg-accent-tint px-2 py-1.5 font-medium text-accent ring-2 ring-accent">
          <span className="truncate">{highlight}</span>
          <span className="shrink-0">{highlightIcon}</span>
        </li>
      </ul>
    </Mock>
  );
}


/** Cabeçalho da tela "Adicionar à Tela de Início" do iOS, com o botão Adicionar em destaque. */
export function IosAddSheet() {
  return (
    <Mock>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-neutral-500">Cancelar</span>
        <span className="truncate font-medium">Tela de Início</span>
        <Hi className="px-2 py-1 text-[12px] font-semibold">Adicionar</Hi>
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-md bg-surface p-1.5">
        <AppIcon size={28} />
        <span className="text-[12px]">Estudatta</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between rounded-md bg-surface px-2 py-1 text-[11px] text-neutral-500">
        <span>Abrir como App Web</span>
        <span className="inline-flex h-3.5 w-6 items-center justify-end rounded-full bg-success px-0.5">
          <span className="h-2.5 w-2.5 rounded-full bg-surface-raised" />
        </span>
      </div>
    </Mock>
  );
}

/** Diálogo de confirmação ("Instalar app?" / "Adicionar ao Dock"). */
export function ConfirmDialog({ title, action }: { title: string; action: string }) {
  return (
    <Mock>
      <div className="flex items-center gap-2">
        <AppIcon size={28} />
        <div className="min-w-0 text-[12px] leading-tight">
          <div className="font-medium">{title}</div>
          <div className="truncate text-[11px] text-neutral-500">estudatta.com.br</div>
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-2 text-[12px]">
        <span className="px-2 py-1 text-neutral-500">Cancelar</span>
        <Hi className="px-2.5 py-1 font-semibold">{action}</Hi>
      </div>
    </Mock>
  );
}

/** Ícone do app. */
export function AppIcon({ size = 36, className }: { size?: number; className?: string }) {
  return <img src="/marca/icon-192.png" alt="" width={size} height={size} className={cn("rounded-[22%] shadow-sm", className)} style={{ width: size, height: size }} />;
}

/** Tela inicial com o ícone do Estudatta entre os outros apps. */
export function HomeScreen() {
  return (
    <Mock>
      <div className="grid grid-cols-4 place-items-center gap-x-2 gap-y-1.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <span key={i} className="flex flex-col items-center gap-0.5">
            <span className="h-7 w-7 rounded-[22%] bg-neutral-700" />
            <span className="h-1 w-5 rounded-full bg-neutral-700" />
          </span>
        ))}
        <span className="flex flex-col items-center gap-0.5">
          <span className="rounded-[26%] ring-2 ring-accent ring-offset-2 ring-offset-canvas">
            <AppIcon size={28} className="shadow-none" />
          </span>
          <span className="text-[9px] font-medium leading-none">Estudatta</span>
        </span>
      </div>
    </Mock>
  );
}

/** Barra de tarefas / Dock do computador com o app. */
export function Dock() {
  return (
    <Mock>
      <div className="mx-auto flex w-fit items-end gap-2 rounded-lg bg-surface px-2.5 py-1.5">
        <span className="h-6 w-6 rounded-[22%] bg-neutral-700" />
        <span className="h-6 w-6 rounded-[22%] bg-neutral-700" />
        <span className="flex flex-col items-center gap-0.5">
          <span className="rounded-[26%] ring-2 ring-accent ring-offset-2 ring-offset-surface">
            <AppIcon size={24} className="shadow-none" />
          </span>
          <span className="h-1 w-1 rounded-full bg-accent" />
        </span>
        <span className="h-6 w-6 rounded-[22%] bg-neutral-700" />
      </div>
    </Mock>
  );
}

/** Menu "Arquivo" do Safari no Mac. */
export function MacFileMenu() {
  return (
    <Mock className="p-1.5">
      <div className="mb-1 flex gap-3 px-1.5 text-[11px] text-neutral-500">
        <span className="font-semibold text-primary">Safari</span>
        <span className="rounded-sm bg-accent-tint px-1 text-accent">Arquivo</span>
        <span>Editar</span>
        <span>Visualizar</span>
      </div>
      <MenuRowsInline rows={["Nova Janela", "Nova Aba"]} highlight="Adicionar ao Dock…" />
    </Mock>
  );
}

function MenuRowsInline({ rows, highlight }: { rows: string[]; highlight: string }) {
  return (
    <ul className="flex flex-col gap-0.5 text-[12px]">
      {rows.map((r) => (
        <li key={r} className="px-2 py-1 text-neutral-500">
          {r}
        </li>
      ))}
      <li className="rounded-md bg-accent-tint px-2 py-1 font-medium text-accent ring-2 ring-accent">{highlight}</li>
    </ul>
  );
}
