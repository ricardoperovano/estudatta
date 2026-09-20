import * as React from "react";
import { ArrowsClockwise, Sparkle, SunHorizon } from "@phosphor-icons/react";
import { Symbol } from "@/components/app/brand";
import { TataSvg, type TataMood } from "@/components/mascot/TataSvg";
import { siteLink } from "@/design/brand";

/**
 * Tela de entrada (entrar, cadastro, recuperar e redefinir senha): o Tatá recebe a pessoa com
 * um balão, o formulário fica num cartão sobre o fundo suave e, no computador, um painel ao
 * lado conta em três linhas o que o Estudatta faz. Sem promessas de resultado.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  mood = "wave",
  greeting,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  mood?: TataMood;
  /** fala do Tatá no balão (padrão: uma boas-vindas curta) */
  greeting?: string;
}) {
  return (
    <div className="app-backdrop flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col px-4 pb-6 pt-[max(20px,calc(12px+env(safe-area-inset-top,0px)))] desktop:flex-row desktop:items-center desktop:gap-12 desktop:px-8">
        {/* painel de marca (só no computador) */}
        <aside className="hidden flex-1 flex-col gap-6 desktop:flex" aria-label="Sobre o Estudatta">
          <a href={siteLink("/")} className="flex w-fit items-center gap-2.5 text-primary no-underline" aria-label="Estudatta — site">
            <Symbol size={32} />
            <span className="text-[22px] font-semibold tracking-[-0.015em]">Estudatta</span>
          </a>
          <h2 className="max-w-[16ch] text-[36px] font-medium leading-[1.1] tracking-[-0.02em]">
            Saiba o que fazer hoje. Retome quando atrasar.
          </h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[15px] text-neutral-300">
            <Benefit icon={<SunHorizon size={20} weight="duotone" />} text="Um plano do dia que cabe na sua rotina, com meta de tempo e dias da semana." />
            <Benefit icon={<ArrowsClockwise size={20} weight="duotone" />} text="Ficou para trás? O tempo vira pendência e é recuperado aos poucos, sem culpa." />
            <Benefit icon={<Sparkle size={20} weight="duotone" />} text="Revisões espaçadas, simulados, conquistas e o Tatá te acompanhando nas sessões." />
          </ul>
        </aside>

        <main className="mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-4 desktop:max-w-[420px]">
          <a href={siteLink("/")} aria-label="Estudatta — site" className="flex w-fit items-center gap-2 text-primary no-underline desktop:hidden">
            <Symbol size={28} />
            <span className="text-[18px] font-semibold tracking-[-0.015em]">Estudatta</span>
          </a>
          <div className="mt-2 flex items-end gap-3">
            <TataSvg mood={mood} size={84} title="Tatá, o mascote do Estudatta" className="shrink-0 rise-in" />
            <p className="tata-bubble tata-bubble--left m-0 mb-4 min-w-0 flex-1 rounded-lg border border-divider bg-surface px-3 py-2 text-[13px] leading-[1.35] text-primary shadow-sm">
              {greeting ?? "Oi! Que bom te ver. Seu plano de hoje está esperando."}
            </p>
          </div>
          <section className="hero-soft rounded-[22px] border border-divider p-5 shadow-sm desktop:p-6" aria-labelledby="auth-title">
            <h1 id="auth-title" className="text-[28px] leading-[1.1] tracking-[-0.015em] desktop:text-[30px]">
              {title}
            </h1>
            {subtitle ? <p className="mt-1.5 text-[14px] text-neutral-300">{subtitle}</p> : null}
            <div className="mt-5 flex flex-col gap-4">{children}</div>
          </section>
          {footer ? <div className="px-1 pt-1 text-center text-[13px] text-neutral-500">{footer}</div> : null}
          <p className="mt-auto px-1 pt-4 text-center text-[12px] text-neutral-500">
            Sem promessa de aprovação ou fluência: o Estudatta organiza o estudo que você já faz.
          </p>
        </main>
      </div>
    </div>
  );
}

function Benefit({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-900 text-accent">{icon}</span>
      <span>{text}</span>
    </li>
  );
}
