import { Link } from "react-router";
import { Logo } from "@/components/app/brand";
import { Button, TrailGlyph } from "@/components/ui";
import { Seo } from "../seo";

const links = [
  { to: "/", label: "Página inicial" },
  { to: "/ingles", label: "Inglês e idiomas" },
  { to: "/concursos", label: "Concursos" },
  { to: "/planos", label: "Planos" },
  { to: "/faq", label: "Perguntas frequentes" },
  { to: "/contato", label: "Contato" },
];

/** 404 no estilo do site: símbolo em traço, título curto, caminhos de volta. Rota de nível superior, por isso traz o próprio cabeçalho. */
export default function NotFoundPage() {
  return (
    <div className="glow-landing flex min-h-dvh flex-col">
      <Seo title="Página não encontrada" description="Este endereço não existe no Estudatta." path="/404" noindex />
      <nav className="mx-auto flex w-full max-w-[1200px] items-center px-gutter-lg py-[8.4px]" aria-label="Site">
        <Link to="/" className="text-primary no-underline hover:text-primary" aria-label="Estudatta — início">
          <Logo size={22} textClassName="text-[18px]" />
        </Link>
      </nav>
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col justify-center gap-6 px-gutter-lg py-[clamp(56px,10vw,112px)]">
        <TrailGlyph size={56} className="text-neutral-600" />
        <span className="tnum text-[13px] uppercase tracking-[0.06em] text-accent">Erro 404</span>
        <h1 className="text-[clamp(40px,6vw,80px)] leading-[1.08] tracking-[-0.015em]">Página não encontrada.</h1>
        <p className="max-w-[56ch] text-[17px] leading-[1.6] text-neutral-300">
          O endereço pode ter mudado ou nunca existiu. O plano continua onde você parou: escolha um caminho abaixo.
        </p>
        <div className="flex flex-wrap gap-[10px]">
          <Button asChild variant="primary" size="lg" className="px-5">
            <Link to="/">Voltar ao início</Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link to="/app">Abrir o app</Link>
          </Button>
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[14px]" aria-label="Outras páginas">
          {links.map((l) => (
            <li key={l.to}>
              <Link to={l.to}>{l.label}</Link>
            </li>
          ))}
        </ul>
      </main>
      <footer className="mx-auto w-full max-w-[1200px] px-gutter-lg pb-14 pt-6 text-[13px] text-neutral-500">
        Se você chegou aqui por um link do próprio app, <Link to="/contato" className="text-neutral-500 hover:text-primary">avise a equipe</Link>.
      </footer>
    </div>
  );
}
