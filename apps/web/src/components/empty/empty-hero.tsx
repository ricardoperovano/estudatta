/**
 * Topo acolhedor das páginas ainda sem dados: cartão hero-soft com o Tatá (ou uma ilustração
 * neutra quando o mascote está desligado), um convite curto e as ações para começar.
 */
import * as React from "react";
import { Sparkle, type Icon } from "@phosphor-icons/react";
import { TataSvg, type TataMood } from "@/components/mascot/TataSvg";
import { useTataPrefs } from "@/components/mascot/use-tata";
import { cn } from "@/lib/utils";

/** Ilustração neutra (mascote desligado): ícone numa bolha suave com brilhinhos. */
export function NeutralArt({ icon: I = Sparkle, className }: { icon?: Icon; className?: string }) {
  return (
    <span
      className={cn(
        "relative grid aspect-square shrink-0 place-items-center rounded-full bg-accent-900 text-accent",
        className,
      )}
      aria-hidden
    >
      <span className="absolute -right-1 top-1 h-2.5 w-2.5 rounded-full bg-warning-tint opacity-90 shadow-[inset_0_0_0_1.5px_var(--color-status-warning)]" />
      <span className="absolute -left-1.5 bottom-3 h-2 w-2 rounded-full bg-info-tint opacity-90 shadow-[inset_0_0_0_1.5px_var(--color-status-info)]" />
      <svg viewBox="0 0 16 16" className="absolute -left-0.5 top-0 h-3 w-3 opacity-70" fill="currentColor">
        <path d="M8 0l1.8 6.2L16 8l-6.2 1.8L8 16l-1.8-6.2L0 8l6.2-1.8Z" />
      </svg>
      <I size="44%" weight="duotone" />
    </span>
  );
}

/**
 * Tatá com o humor pedido, ou a ilustração neutra se a pessoa desligou o mascote.
 * O tamanho vem da classe de largura (ex.: "w-[84px] desktop:w-[124px]").
 */
export function EmptyArt({ mood, icon, className }: { mood: TataMood; icon?: Icon; className?: string }) {
  const { enabled } = useTataPrefs();
  return enabled ? (
    <TataSvg mood={mood} size={124} className={cn("h-auto shrink-0", className)} />
  ) : (
    <NeutralArt icon={icon} className={className} />
  );
}

export interface EmptyHeroProps {
  /** rótulo pequeno acima do título */
  kicker?: string;
  title: string;
  children?: React.ReactNode;
  /** botões/links para começar */
  actions?: React.ReactNode;
  mood?: TataMood;
  /** ícone da ilustração neutra (mascote desligado) */
  icon?: Icon;
  /** nível do título: h2 por padrão (a página já tem o h1) */
  as?: "h1" | "h2";
  className?: string;
}

export function EmptyHero({
  kicker,
  title,
  children,
  actions,
  mood = "wave",
  icon,
  as: Heading = "h2",
  className,
}: EmptyHeroProps) {
  const id = React.useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "hero-soft rise-in relative overflow-hidden rounded-[22px] p-5 shadow-sm desktop:p-7",
        className,
      )}
    >
      <Deco />
      <div className="relative flex items-start gap-4 desktop:gap-6">
        <div className="min-w-0 flex-1">
          {kicker ? <span className="kicker-accent">{kicker}</span> : null}
          <Heading id={id} className="mt-1 text-[21px] font-medium leading-[1.2] desktop:text-[26px]">
            {title}
          </Heading>
          {children ? (
            <div className="mt-2 flex flex-col gap-2 text-[14px] leading-[1.5] text-neutral-300 desktop:text-[15px]">
              {children}
            </div>
          ) : null}
        </div>
        <EmptyArt
          mood={mood}
          icon={icon}
          className="-mr-1 -mt-1 w-[80px] desktop:mr-0 desktop:mt-0 desktop:w-[120px]"
        />
      </div>
      {actions ? <div className="relative mt-4 flex flex-wrap gap-2 desktop:mt-5">{actions}</div> : null}
    </section>
  );
}

/** Enfeites decorativos bem suaves (os mesmos do topo da tela Hoje). */
function Deco() {
  return (
    <svg
      className="pointer-events-none absolute bottom-3 right-6 h-16 w-28 text-accent opacity-25"
      viewBox="0 0 160 96"
      fill="currentColor"
      aria-hidden
    >
      <path d="M130 10 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 Z" />
      <path d="M40 58 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z" />
      <circle cx="150" cy="60" r="3" />
      <circle cx="88" cy="20" r="2" />
    </svg>
  );
}
