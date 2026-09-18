import { Link } from "react-router";
import { Container } from "../layout";
import { Seo, pageMeta } from "../seo";
import { Button, Card, CardBody, CardKicker, CardTitle } from "@/components/ui";
import { PhoneMock } from "./home";
import { HowItWorks } from "../sections/how";
import { BalanceDemo } from "../sections/balance";
import { FaqSection } from "../sections/faq";
import { PlansSection } from "../sections/plans";
import { WaitlistSection } from "../sections/waitlist";

const fronts = [
  { kicker: "Curso ou aula", title: "A aula conta na meta", text: "Presencial, on-line ou particular: abra o cronômetro durante a aula ou registre depois. O tempo entra no objetivo do dia." },
  { kicker: "Podcast e série", title: "Listening no trajeto", text: "Ouviu vinte minutos no ônibus? Registre em segundos, ainda hoje ou amanhã. Sem internet também funciona." },
  { kicker: "Livro e leitura", title: "Páginas como material", text: "Cadastre o livro ou o PDF e o intervalo de páginas. Você sabe onde parou e quanto falta." },
  { kicker: "Vocabulário e exercícios", title: "Uma frente para cada coisa", text: "Listening, vocabulário, gramática, conversação: cada frente vira um tópico do mesmo objetivo, com o tempo somado no relatório." },
];

const faq = [
  { q: "O app ensina inglês?", a: "Não. Ele não tem aulas, exercícios nem correção. Organiza o estudo que você já faz — curso, podcast, série, livro — e acompanha o tempo dedicado a cada frente." },
  { q: "Funciona com qualquer curso ou método?", a: "Sim. Curso presencial ou on-line, aula particular, aplicativo de idiomas, livro didático, intercâmbio: o objetivo é seu, o material é seu. O app registra o tempo e mantém o plano." },
  { q: "Consigo separar o tempo por frente — listening, vocabulário, gramática, conversação?", a: "Sim. Cada frente é um tópico dentro do objetivo. Ao registrar uma sessão, você escolhe o tópico; o relatório mostra quanto tempo foi para cada um." },
  { q: "Ouvir podcast no trajeto conta?", a: "Conta, se você quiser que conte. Registre manualmente a duração e o tópico quando lembrar; a pendência do dia se ajusta." },
  { q: "E se 60 minutos por dia não couber na minha semana?", a: "Defina a meta que cabe — 20, 30, 45 minutos — e os dias da semana. Semanas difíceis e férias entram como pausa planejada, sem virar dívida." },
  { q: "O relatório mede fluência?", a: "Não. Ele mede constância e tempo por objetivo e por frente. Fluência se mede nas suas conversas, provas e no que você entende do que ouve e lê." },
];

/** Página para inglês e idiomas: campanha “60 minutos por dia. Mesmo depois de ontem.”, frentes de estudo, demonstração de saldo, como funciona, FAQ, planos e cadastro. */
export default function InglesPage() {
  return (
    <>
      <Seo {...pageMeta["/ingles"]} />
      <Container>
        <section className="grid items-center gap-12 py-[clamp(56px,10vw,112px)] pb-[84px] tablet:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
          <div className="flex flex-col gap-6">
            <span className="text-[13px] uppercase tracking-[0.06em] text-accent">Inglês e idiomas</span>
            <h1 className="text-[clamp(40px,6vw,80px)] leading-[1.08] tracking-[-0.015em]">
              <span className="block">60 minutos por dia.</span>
              <span className="block">Mesmo depois de ontem.</span>
            </h1>
            <p className="max-w-[56ch] text-[17px] leading-[1.6] text-neutral-300">
              Curso, podcast, série ou livro: o app acompanha o tempo dedicado a cada frente e mantém a constância visível. Ele não ensina inglês — organiza o estudo que você já faz e mostra como retomar quando um dia fica para trás.
            </p>
            <div className="flex flex-wrap gap-[10px]">
              <Button asChild variant="primary" size="lg" className="px-5">
                <Link to="/cadastro">Começar grátis</Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <a href="#saldo">Ver o saldo do dia</a>
              </Button>
            </div>
            <span className="text-[13px] text-neutral-500">Funciona no navegador e instala como app. Sem cartão para começar.</span>
          </div>
          <div className="flex justify-center">
            <PhoneMock />
          </div>
        </section>

        <section className="flex flex-col gap-6 pb-24" aria-labelledby="frentes-titulo">
          <span className="text-[13px] uppercase tracking-[0.06em] text-accent">Uma meta, várias frentes</span>
          <h2 id="frentes-titulo" className="max-w-[24ch] text-[32px] leading-[1.15]">Tudo o que você já faz em inglês cabe no mesmo plano</h2>
          <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
            {fronts.map((f) => (
              <Card key={f.kicker} className="gap-[10px] p-6">
                <CardKicker>{f.kicker}</CardKicker>
                <CardTitle className="text-[20px]">{f.title}</CardTitle>
                <CardBody className="text-[15px]">{f.text}</CardBody>
              </Card>
            ))}
          </div>
        </section>
      </Container>

      <BalanceDemo objective="Inglês" />

      <Container>
        <HowItWorks />
        <section className="flex flex-col gap-6 pb-24 pt-8" aria-label="Sem promessas">
          <div className="grid gap-4 tablet:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
            <Feature title="Constância, não fluência" text="O relatório mostra dias com registro e tempo por frente. Ele não avalia pronúncia, vocabulário ou nível." />
            <Feature title="Tom escolhido por você" text="Acolhedor, direto ou firme. A mensagem do dia muda; a cobrança não vira culpa." />
            <Feature title="Dia sem registro ≠ dia perdido" text="Esqueceu de registrar? Registre depois. Não estudou? Vira tempo a recuperar, pela regra que você escolheu." />
            <Feature title="Pausa planejada" text="Viagem, prova na faculdade, semana pesada no trabalho: marque a pausa e a pendência não cresce." />
          </div>
        </section>
        <PlansSection />
        <FaqSection items={faq} title="Perguntas de quem estuda idiomas" />
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
