import * as React from "react";
import { Link } from "react-router";
import { Symbol } from "@/components/app/brand";

/** Tela de entrada: brilho no canto superior direito (como Boas-vindas), símbolo 40px, título 32/500. */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="glow-top-right flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-[18px] px-5 pb-6 pt-[max(64px,calc(40px+env(safe-area-inset-top,0px)))]">
        <Link to="/" aria-label="Estudatta — página inicial" className="w-fit">
          <Symbol size={40} />
        </Link>
        <h1 className="mt-2 text-[32px] leading-[1.1]">{title}</h1>
        {subtitle ? <p className="text-[15px] text-neutral-300">{subtitle}</p> : null}
        <div className="mt-2 flex flex-col gap-4">{children}</div>
        {footer ? <div className="mt-auto pt-6 text-[13px] text-neutral-500">{footer}</div> : null}
      </div>
    </div>
  );
}
