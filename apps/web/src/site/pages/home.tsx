import { Link } from "react-router";
import { Container } from "../layout";
import { Seo, pageMeta } from "../seo";
import { Button, Card, CardBody, CardKicker, CardTitle, GoalBar } from "@/components/ui";
import { PlansSection } from "../sections/plans";
import { FaqSection } from "../sections/faq";
import { WaitlistSection } from "../sections/waitlist";
import { HowItWorks } from "../sections/how";

/** Página principal, fiel a 06 Landing: hero + mockup Hoje, faixa do problema, como funciona, para quem, planos, FAQ, cadastro. */
export function HomePage() {
  return (
    <>
      <Seo {...pageMeta["/"]} />
      <Container>
        <section className="grid items-center gap-12 py-[clamp(56px,10vw,112px)] pb-[84px] tablet:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
          <div className="flex flex-col gap-6">
            <h1 className="text-[clamp(40px,6vw,80px)] leading-[1.08] tracking-[-0.015em]">
              <span className="block">Saiba o que fazer hoje.</span>
              <span className="block">Retome quando atrasar.</span>
            </h1>
            <p className="max-w-[56ch] text-[17px] leading-[1.6] text-neutral-300">
              Você define meta, dias e horários. O app organiza o plano, registra as sessões e transforma o que faltou em tempo a recuperar — no seu ritmo, sem culpa.
            </p>
            <div className="flex flex-wrap gap-[10px]">
              <Button asChild variant="primary" size="lg" className="px-5">
                <Link to="/cadastro">Começar grátis</Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <a href="#como">Ver como funciona</a>
              </Button>
            </div>
            <span className="text-[13px] text-neutral-500">Funciona no navegador e instala como app. Sem cartão para começar.</span>
          </div>
          <div className="flex justify-center">
            <PhoneMock />
          </div>
        </section>
      </Container>

      <section className="bg-section py-16" aria-label="O problema" style={{ background: "radial-gradient(900px 420px at 85% -40%, color-mix(in srgb, var(--color-section-glow) 70%, transparent), transparent 64%), var(--color-section)" }}>
        <Container className="grid items-center gap-8 tablet:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
          <p className="max-w-[24ch] text-[clamp(24px,3vw,36px)] leading-[1.25] tracking-[-0.01em] text-[#e9e9ed]">“Eu queria estudar uma hora por dia, mas não sei quanto estudei, quanto ficou pendente e como retomar.”</p>
          <p className="max-w-[48ch] text-[16px] leading-[1.6] text-[color-mix(in_srgb,#e9e9ed_80%,transparent)]">
            É para isso que o app existe. Ele não dá aula nem mede fluência: organiza o estudo que você já faz em cursos, livros, PDFs, vídeos e exercícios — e mostra, todo dia, o compromisso, o realizado e o próximo passo.
          </p>
        </Container>
      </section>

      <Container>
        <HowItWorks />
        <section id="casos" className="flex flex-col gap-6 pb-24 pt-8">
          <span className="text-[13px] uppercase tracking-[0.06em] text-accent">Para quem</span>
          <div className="grid gap-4 tablet:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
            <Card className="gap-[10px] p-6">
              <CardKicker>Inglês e idiomas</CardKicker>
              <CardTitle className="text-[22px]">60 minutos por dia. Mesmo depois de ontem.</CardTitle>
              <CardBody className="text-[15px]">Curso, podcast, série ou livro: o app acompanha o tempo dedicado a cada frente e mantém a constância visível.</CardBody>
              <Link to="/ingles" className="text-[14px]">Ver para inglês →</Link>
            </Card>
            <Card className="gap-[10px] p-6">
              <CardKicker>Concursos</CardKicker>
              <CardTitle className="text-[22px]">Edital longo. Plano do dia curto.</CardTitle>
              <CardBody className="text-[15px]">Matérias, tópicos, PDFs com intervalo de páginas e tarefas. Você sabe onde parou e o que vem em seguida.</CardBody>
              <Link to="/concursos" className="text-[14px]">Ver para concursos →</Link>
            </Card>
            <Card className="gap-[10px] p-6">
              <CardKicker>Rotina pessoal</CardKicker>
              <CardTitle className="text-[22px]">Atrasou ontem? Hoje dá para retomar.</CardTitle>
              <CardBody className="text-[15px]">Leitura, instrumento, organização da casa. Qualquer prática com meta de tempo cabe no mesmo plano.</CardBody>
            </Card>
          </div>
          <div className="mt-4 grid gap-4 tablet:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
            <Feature title="Tom escolhido por você" text="Acolhedor, direto ou firme. Nenhum deles trata você como criança." />
            <Feature title="Sem registro ≠ sem estudo" text="“Você estudou e esqueceu de registrar?” — a pendência se ajusta." />
            <Feature title="Pausa planejada" text="Férias e semanas difíceis não viram dívida." />
            <Feature title="Relatório honesto" text="Mede constância e tempo — não fluência, domínio ou aprovação." />
          </div>
        </section>
        <PlansSection />
        <FaqSection />
        <div className="hr-fade" />
        <WaitlistSection />
      </Container>
    </>
  );
}

function Feature({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-medium">{title}</span>
      <span className="text-[14px] text-neutral-400">{text}</span>
    </div>
  );
}

/** Demonstração de saldo e recuperação: mesmos dados dos mockups (60/40/60/20). */
export function PhoneMock() {
  return (
    <div className="flex w-[min(100%,360px)] flex-col gap-[14px] rounded-phone bg-canvas px-4 pb-5 pt-11 shadow-lg" aria-label="Demonstração da tela Hoje" role="img">
      <div>
        <span className="text-[12px] text-neutral-400">quinta, 17 set</span>
        <div className="text-[22px] font-medium">Hoje</div>
      </div>
      <Card elev="sm" className="gap-3 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[16px] font-medium">Inglês</span>
          <span className="text-[12px] text-neutral-400">meta 60 min</span>
        </div>
        <GoalBar logged={2400} target={3600} recovery={1200} />
        <div className="tnum grid grid-cols-2 gap-[10px]">
          <div><span className="block text-[18px] font-medium">40 min</span><span className="text-[11px] text-neutral-400">Registrado hoje</span></div>
          <div><span className="block text-[18px] font-medium">20 min</span><span className="text-[11px] text-neutral-400">Falta para a meta</span></div>
          <div><span className="block text-[18px] font-medium text-pending">60 min</span><span className="text-[11px] text-neutral-400">Pendência anterior</span></div>
          <div><span className="block text-[18px] font-medium text-pending">20 min</span><span className="text-[11px] text-neutral-400">Recuperação sugerida</span></div>
        </div>
        <p className="rounded-md bg-canvas px-3 py-[10px] text-[13px] leading-[1.45]">Mais 40 min hoje: 20 da meta + 20 de recuperação.</p>
        <div className="inline-flex min-h-[48px] items-center justify-center rounded-md border border-accent text-[15px] font-medium text-accent">Começar sessão</div>
      </Card>
    </div>
  );
}
