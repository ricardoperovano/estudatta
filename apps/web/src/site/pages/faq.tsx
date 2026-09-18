import { Link } from "react-router";
import { Container } from "../layout";
import { Seo, pageMeta } from "../seo";
import { FaqSection, faqItems } from "../sections/faq";
import { WaitlistSection } from "../sections/waitlist";
import { brand } from "@/design/brand";

/** Busca uma pergunta da lista compartilhada pelo início do enunciado, para não duplicar o texto. */
function shared(prefix: string) {
  return faqItems.filter((it) => it.q.startsWith(prefix));
}

const groups: { id: string; kicker: string; title: string; items: typeof faqItems }[] = [
  {
    id: "o-app",
    kicker: "O app",
    title: "O que o app faz — e o que não faz",
    items: [
      ...shared("O app ensina"),
      ...shared("O relatório diz"),
      ...shared("O que acontece quando"),
      { q: "Serve só para inglês e concursos?", a: "Não. Qualquer estudo ou prática com meta de tempo cabe: leitura, instrumento, faculdade, certificação. Inglês e concursos são os casos mais comuns, por isso têm páginas próprias." },
    ],
  },
  {
    id: "offline-e-aparelhos",
    kicker: "Offline e aparelhos",
    title: "Sem internet, no celular e no computador",
    items: [
      ...shared("Funciona sem internet"),
      { q: "O que exatamente funciona offline?", a: "Ver o plano do dia, usar o cronômetro e registrar sessões. Tudo fica salvo no aparelho e sincroniza quando a conexão voltar. Entrar na conta, pagar, enviar arquivos e importar o edital precisam de internet." },
      { q: "E se eu registrar no celular sem internet e depois no computador?", a: "Os registros dos dois aparelhos são sincronizados. Quando a mesma informação foi alterada nos dois lados, o app mostra o conflito para você decidir, em vez de escolher sozinho." },
      ...shared("Preciso instalar"),
      { q: "Funciona no iPhone?", a: "Sim, pelo Safari. Para receber lembretes no iPhone ou iPad, adicione o app à tela inicial (Compartilhar → Adicionar à Tela de Início) e permita as notificações quando o app pedir. Sem esse passo, o sistema da Apple não entrega notificações de sites." },
      ...shared("Os lembretes tocam"),
    ],
  },
  {
    id: "materiais-e-importacao",
    kicker: "Materiais e importação",
    title: "PDFs, edital e o que a IA faz",
    items: [
      { q: "Meu PDF é escaneado, sem texto selecionável. A importação funciona?", a: "Não. A importação lê a camada de texto do PDF; quando ela não existe, o app avisa que não conseguiu ler, em vez de inventar uma estrutura. O reconhecimento de texto em imagem (OCR) não está disponível. Cole o texto manualmente ou use o modelo de CSV. Como material de estudo, o PDF escaneado pode ser enviado normalmente, com intervalo de páginas." },
      { q: "O que a IA faz no app?", a: "Três coisas, todas opcionais e só quando você pede: sugerir a estrutura de matérias e tópicos a partir de um texto ou de uma importação; sugerir uma distribuição do plano; redigir o resumo da semana. Toda resposta é uma prévia: nada muda até você revisar e confirmar." },
      { q: "E o que a IA não faz?", a: "Não dá aula, não corrige exercícios, não avalia seu nível, não prevê resultado de prova e não roda em segundo plano. Os recursos de IA podem estar desligados; nesse caso o app informa e você organiza tudo manualmente, sem perder nenhuma função essencial." },
      { q: "O que é enviado quando uso um recurso de IA?", a: "Apenas o trecho necessário: o texto que você colou ou importou, ou os títulos dos tópicos e os números do período. Seu e-mail, nome e identificadores de conta não são enviados. Os detalhes estão na política de privacidade." },
    ],
  },
  {
    id: "dados-e-privacidade",
    kicker: "Dados e privacidade",
    title: "Seus dados são seus",
    items: [
      { q: "Quais dados o app guarda?", a: "Os que você cria — objetivos, metas, sessões, tarefas, materiais — e os necessários para a conta funcionar, como e-mail e sessões de acesso. A lista completa, com finalidade e prazo, está na política de privacidade." },
      { q: "Consigo exportar meus dados?", a: "Sim, em qualquer plano e a qualquer momento: todos os seus dados em um arquivo JSON e o histórico de sessões em CSV, que abre em planilhas. A exportação não depende de assinatura." },
      { q: "Posso excluir minha conta?", a: "Sim, pelas configurações do app. Os prazos e o que é apagado estão descritos na política de privacidade." },
      { q: "Vocês vendem dados ou mostram anúncios?", a: "Não. O serviço se mantém pela assinatura do plano Completo. Métricas de uso só são coletadas se você consentir, e a resposta pode ser mudada depois." },
    ],
  },
  {
    id: "planos-e-cancelamento",
    kicker: "Planos e cancelamento",
    title: "Assinar, cancelar e continuar com seus dados",
    items: [
      ...shared("Posso cancelar"),
      { q: "O que acontece com meus dados depois de cancelar?", a: "Nada é apagado. Você volta ao plano Gratuito ao fim do período pago; o histórico continua visível e a exportação continua disponível." },
      { q: "Preciso de cartão para criar a conta?", a: "Não. A conta gratuita não pede forma de pagamento." },
    ],
  },
];

/** Perguntas frequentes agrupadas por tema; reaproveita `faqItems` e acrescenta os temas que só cabem aqui. */
export default function FaqPage() {
  return (
    <>
      <Seo {...pageMeta["/faq"]} />
      <Container>
        <header className="flex flex-col gap-6 pb-16 pt-[clamp(56px,10vw,112px)]">
          <span className="text-[13px] uppercase tracking-[0.06em] text-accent">Perguntas frequentes</span>
          <h1 className="max-w-[18ch] text-[clamp(40px,6vw,80px)] leading-[1.08] tracking-[-0.015em]">O que o app faz — e o que não faz.</h1>
          <nav aria-label="Temas" className="flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
            {groups.map((g) => (
              <a key={g.id} href={`#${g.id}`} className="inline-flex min-h-[44px] items-center">{g.kicker}</a>
            ))}
          </nav>
        </header>
        {groups.map((g) => (
          <FaqSection key={g.id} id={g.id} kicker={g.kicker} title={g.title} items={g.items} />
        ))}
        <p className="pb-16 text-[15px] leading-[1.6] text-neutral-300">
          Não achou a resposta? Escreva para <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a> ou use a página de <Link to="/contato">contato</Link>. Planos e limites estão em <Link to="/planos">planos</Link>; o tratamento de dados, em <Link to="/privacidade">privacidade</Link>.
        </p>
        <div className="hr-fade" />
        <WaitlistSection />
      </Container>
    </>
  );
}
