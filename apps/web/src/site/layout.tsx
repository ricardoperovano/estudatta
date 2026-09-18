import { Link, NavLink, Outlet } from "react-router";
import { Logo, Symbol } from "@/components/app/brand";
import { Button } from "@/components/ui";
import { brand } from "@/design/brand";
import { cn } from "@/lib/utils";

/** Layout do site público, fiel a 06 Landing: nav com brand + links + CTA contorno; rodapé simples. */
export function SiteLayout() {
  return (
    <div className="glow-landing min-h-dvh">
      <nav className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-[11px] gap-y-2 px-gutter-lg py-[8.4px] text-[14px]" aria-label="Site">
        <Link to="/" className="mr-auto text-primary no-underline hover:text-primary" aria-label="Estudatta — início">
          <Logo size={22} textClassName="text-[18px]" />
        </Link>
        <SiteLink to="/ingles">Inglês</SiteLink>
        <SiteLink to="/concursos">Concursos</SiteLink>
        <SiteLink to="/planos">Planos</SiteLink>
        <SiteLink to="/faq">Perguntas</SiteLink>
        <Button asChild variant="primary">
          <Link to="/cadastro">Criar conta</Link>
        </Button>
        <Link to="/entrar" className="text-[14px] text-neutral-300 no-underline hover:text-primary">
          Entrar
        </Link>
      </nav>
      <Outlet />
      <footer className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-gutter-lg pb-14 pt-6 text-[13px] text-neutral-500">
        <span className="flex items-center gap-2">
          <Symbol size={16} />
          {brand.name}
        </span>
        <span className="flex flex-wrap gap-x-2">
          <Link to="/privacidade" className="text-neutral-500 no-underline hover:text-primary">Privacidade</Link>
          <span aria-hidden>·</span>
          <Link to="/termos" className="text-neutral-500 no-underline hover:text-primary">Termos</Link>
          <span aria-hidden>·</span>
          <Link to="/contato" className="text-neutral-500 no-underline hover:text-primary">Contato</Link>
        </span>
      </footer>
    </div>
  );
}

function SiteLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink to={to} className={({ isActive }) => cn("text-[14px] no-underline hover:text-accent", isActive ? "text-accent" : "text-primary")}>
      {children}
    </NavLink>
  );
}

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto max-w-[1200px] px-gutter-lg", className)}>{children}</div>;
}
