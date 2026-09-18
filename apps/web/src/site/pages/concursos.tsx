import { Link } from "react-router";
import { Container } from "../layout";
import { Seo, pageMeta } from "../seo";
import { Button, Card, CardBody, CardKicker, CardTitle } from "@/components/ui";
import { SubjectTree } from "../sections/subject-tree";
import { HowItWorks } from "../sections/how";
import { BalanceDemo } from "../sections/balance";
import { FaqSection } from "../sections/faq";
import { PlansSection } from "../sections/plans";
import { WaitlistSection } from "../sections/waitlist";

const blocks = [
  { kicker: "Matérias e tópicos", title: "O edital vira uma árvore", text: "Cada matéria com seus tópicos, na ordem que você preferir. Ao registrar uma sessão, você escolhe o tópico; o relatório soma o tempo por matéria." },
  { kicker: "PDFs e materiais", title: "Intervalo de páginas por tópico", text: "Envie o PDF, cadastre o livro físico ou cole o link da videoaula. Ligue o material ao tópico com o intervalo — “p. 12–34” — e saiba onde parou." },
  { kicker: "Tarefas", title: "O que fazer além do tempo", text: "Revisar a unidade, resolver a lista, refazer as questões erradas: tarefas ficam junto do tópico e aparecem no plano do dia." },
  { kicker: "Prazo da prova", title: "Um fim à vista", text: "Informe a data da prova como prazo final do objetivo. Saiu o edital ou mudou a data? Ajuste o prazo; o histórico fica como está." },
];

const importSteps = [
  { n: "01", title: "Cole, envie a planilha ou o PDF", text: "Texto colado do edital, arquivo CSV (há um modelo para baixar) ou o PDF do próprio edital." },
  { n: "02", title: "Revise a prévia", text: "O app monta uma proposta de matérias e tópicos. Você renomeia, move, junta ou apaga o que não fizer sentido." },
  { n: "03", title: "Confirme", text: "Nada entra no seu plano antes da sua confirmação. Se desistir, é só cancelar a importação." },
];

const faq = [
  { q: "O app tem conteúdo, aulas ou questões de concurso?", a: "Não. Ele não tem videoaulas, apostilas nem banco de questões. Organiza o estudo que você faz com o seu curso, seus PDFs e seus livros, e acompanha o tempo dedicado a cada matéria." },
  { q: "O app aumenta minha chance de aprovação?", a: "Não prometemos isso. O app mostra compromisso, tempo realizado e pendência por matéria. Aprovação depende de muita coisa que ele não mede nem controla." },
  { q: "Como funciona a importação do conteúdo programático?", a: "Você cola o texto do edital, envia um CSV ou o PDF. O app propõe uma estrutura de matérias e tópicos e você revisa antes de confirmar. Texto e CSV ficam prontos na hora; o PDF é processado em seguida e avisa quando a prévia está disponível." },
  { q: "E se o PDF do edital for escaneado, sem texto selecionável?", a: "A importação falha com um aviso claro, em vez de inventar uma estrutura. Nesse caso, cole o texto manualmente ou use o modelo de CSV." },
  { q: "Posso estudar várias matérias no mesmo dia?", a: "Sim. A meta de tempo é do objetivo; cada sessão é registrada em um tópico. No fim do dia você vê o total e a divisão por matéria." },
  { q: "O que acontece com o plano se a prova for adiada ou o edital mudar?", a: "Você altera o prazo final e edita a árvore de matérias. As sessões já registradas continuam no histórico e nos relatórios." },
  { q: "Consigo acompanhar mais de um concurso ao mesmo tempo?", a: "Cada concurso é um objetivo. O plano Gratuito tem um objetivo ativo; o Completo permite vários. Os limites de cada plano estão na página de planos." },
];

/** Página para concursos: campanha “Edital longo. Plano do dia curto.”, estrutura do edital, importação com revisão, saldo, como funciona, FAQ, planos e cadastro. */
export default function ConcursosPage() {
  return (
    <>
      <Seo {...pageMeta["/concursos"]} />
      <Container>
        <section className="grid items-center gap-12 py-[clamp(56px,10vw,112px)] pb-[84px] tablet:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
          <div className="flex flex-col gap-6">
            <span className="text-[13px] uppercase tracking-[0.06em] text-accent">Concursos</span>
            <h1 className="text-[clamp(40px,6vw,80px)] leading-[1.08] tracking-[-0.015em]">
              <span className="block">Edital longo.</span>
              <span className="block">Plano do dia curto.</span>
            </h1>
            <p className="max-w-[56ch] text-[17px] leading-[1.6] text-neutral-300">
              Matérias, tópicos, PDFs com intervalo de páginas e tarefas em um só lugar. Todo dia você vê o compromisso, o que já registrou e o próximo passo. O app não tem aulas nem questões: organiza o estudo que você já faz.
            </p>
            <div className="flex flex-wrap gap-[10px]">
              <Button asChild variant="primary" size="lg" className="px-5">
                <Link to="/cadastro">Começar grátis</Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <a href="#importacao">Ver a importação do edital</a>
              </Button>
            </div>
            <span className="text-[13px] text-neutral-500">Funciona no navegador e instala como app. Sem cartão para começar.</span>
          </div>
          <div className="flex justify-center">
            <div className="w-[min(100%,420px)]">
              <SubjectTree />
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6 pb-24" aria-labelledby="estrutura-titulo">
          <span className="text-[13px] uppercase tracking-[0.06em] text-accent">Do edital ao dia</span>
          <h2 id="estrutura-titulo" className="max-w-[24ch] text-[32px] leading-[1.15]">O conteúdo programático inteiro, sem perder o fio</h2>
          <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
            {blocks.map((b) => (
              <Card key={b.kicker} className="gap-[10px] p-6">
                <CardKicker>{b.kicker}</CardKicker>
                <CardTitle className="text-[20px]">{b.title}</CardTitle>
                <CardBody className="text-[15px]">{b.text}</CardBody>
              </Card>
            ))}
          </div>
        </section>

        <section id="importacao" className="flex flex-col gap-2 pb-24" aria-labelledby="importacao-titulo">
          <span className="text-[13px] uppercase tracking-[0.06em] text-accent">Importação do conteúdo programático</span>
          <h2 id="importacao-titulo" className="mb-2 mt-2 max-w-[26ch] text-[32px] leading-[1.15]">Texto, CSV ou PDF — sempre com revisão sua</h2>
          {importSteps.map((s, i) => (
            <div key={s.n} className={"grid items-baseline gap-x-[clamp(24px,4vw,72px)] gap-y-3 py-6 tablet:grid-cols-[minmax(48px,120px)_minmax(0,380px)_minmax(0,1fr)]" + (i > 0 ? " border-t border-neutral-800" : "")}>
              <span className="tnum text-[15px] text-accent">{s.n}</span>
              <h3 className="text-[20px] leading-[1.25]">{s.title}</h3>
              <p className="max-w-[52ch] text-[15.5px] leading-[1.65] text-neutral-300">{s.text}</p>
            </div>
          ))}
          <p className="max-w-[64ch] text-[14px] leading-[1.6] text-neutral-400">
            PDF escaneado, sem texto selecionável, não é lido: a importação avisa e você segue pelo texto colado ou pelo CSV. A sugestão de estrutura por IA é opcional, só roda quando você pede e também passa pela sua revisão.
          </p>
        </section>
      </Container>

      <BalanceDemo objective="Concurso" />

      <Container>
        <HowItWorks />
        <section className="flex flex-col gap-6 pb-24 pt-8" aria-label="Sem promessas">
          <div className="grid gap-4 tablet:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
            <Feature title="Tempo, não aprovação" text="O relatório mostra constância e tempo por matéria. Ele não mede domínio do conteúdo nem prevê resultado de prova." />
            <Feature title="Dia sem registro ≠ dia perdido" text="Estudou e esqueceu de registrar? Registre depois. Não estudou? Vira tempo a recuperar, pela regra que você escolheu." />
            <Feature title="Pausa planejada" text="Semana de plantão, viagem, descanso depois de uma prova: marque a pausa e a pendência não cresce." />
            <Feature title="Funciona sem internet" text="Biblioteca, ônibus, sala de estudo sem sinal: a sessão fica salva no aparelho e sincroniza depois." />
          </div>
        </section>
        <PlansSection />
        <FaqSection items={faq} title="Perguntas de quem estuda para concurso" />
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
