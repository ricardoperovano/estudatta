import { Link } from "react-router";
import { Seo, pageMeta } from "../seo";
import { LegalDoc, LegalSection, LegalSub, Pending } from "../sections/legal";
import { brand } from "@/design/brand";

const toc = [
  { id: "aceite", label: "Aceitação e partes" },
  { id: "servico", label: "O que o serviço é — e o que não é" },
  { id: "conta", label: "Conta e acesso" },
  { id: "planos", label: "Planos, preços e cobrança" },
  { id: "conteudo", label: "Seu conteúdo e seus arquivos" },
  { id: "uso", label: "Uso aceitável" },
  { id: "ia", label: "Recursos de IA" },
  { id: "notificacoes", label: "Lembretes e notificações" },
  { id: "disponibilidade", label: "Disponibilidade e mudanças no serviço" },
  { id: "encerramento", label: "Encerramento da conta" },
  { id: "responsabilidade", label: "Responsabilidade" },
  { id: "lei", label: "Lei aplicável e foro" },
  { id: "contato", label: "Contato" },
];

const pending = [
  "razão social, CNPJ e endereço do responsável",
  "idade mínima para criar conta",
  "política de reembolso",
  "foro para solução de conflitos",
];

/** Termos de uso em pt-BR, alinhados ao comportamento implementado (planos, cobrança, exclusão, IA, materiais). */
export default function TermosPage() {
  return (
    <>
      <Seo {...pageMeta["/termos"]} />
      <LegalDoc
        kicker="Termos de uso"
        title="Termos de uso do Estudatta"
        lead="O combinado entre você e o serviço: o que ele faz, o que não promete, como funcionam conta, planos, cobrança e encerramento. Escrito para ser lido inteiro em poucos minutos."
        pending={pending}
        toc={toc}
      >
        <LegalSection id="aceite" n={1} title="Aceitação e partes">
          <p>
            Estes termos regem o uso do site <strong>{brand.domain}</strong>, do aplicativo web que ele hospeda e da API que o atende (em conjunto, o “serviço”), operados por <Pending>razão social a definir pelo responsável</Pending>, CNPJ <Pending>a definir pelo responsável</Pending>, com endereço em <Pending>a definir pelo responsável</Pending> (“nós”).
          </p>
          <p>
            Ao criar uma conta ou usar o serviço, você concorda com estes termos e com a <Link to="/privacidade">política de privacidade</Link>. Se não concordar, não use o serviço.
          </p>
        </LegalSection>

        <LegalSection id="servico" n={2} title="O que o serviço é — e o que não é">
          <p>
            O {brand.name} é um planejador de estudo e prática. Você define um objetivo, uma meta de tempo por dia, os dias da semana e, se quiser, matérias, tópicos, materiais e tarefas. O serviço organiza o plano, registra as sessões (por cronômetro ou registro manual), calcula o saldo do dia e transforma o que faltou em tempo a recuperar, pela regra que você escolher.
          </p>
          <p><strong>O serviço não:</strong></p>
          <ul>
            <li>ensina idiomas, oferece conteúdo de concurso, questões, aulas ou correção;</li>
            <li>garante aprovação, fluência, nota, domínio de conteúdo ou o fim da procrastinação;</li>
            <li>avalia aprendizado: os relatórios medem <strong>constância e tempo</strong>, e só isso;</li>
            <li>substitui orientação pedagógica, médica ou psicológica.</li>
          </ul>
          <p>Os resultados do seu estudo dependem do seu material, do seu método e de você.</p>
        </LegalSection>

        <LegalSection id="conta" n={3} title="Conta e acesso">
          <ul>
            <li>Para usar o aplicativo é preciso criar uma conta com um e-mail válido e uma senha de pelo menos 8 caracteres, ou entrar com Google quando esse login estiver disponível. Enviamos um e-mail de confirmação; a confirmação pode ser exigida para entrar.</li>
            <li>Idade mínima para criar conta: <Pending>a definir pelo responsável</Pending>.</li>
            <li>A conta é pessoal. Você é responsável por manter a senha em sigilo e por tudo o que for feito com ela. Na tela de sessões você vê os aparelhos conectados e pode encerrar qualquer um deles; trocar a senha encerra as demais sessões.</li>
            <li>Por segurança, limitamos tentativas de entrada, de confirmação e de recuperação de senha; ao exceder o limite, o serviço pede que você aguarde.</li>
            <li>Informe dados verdadeiros. Podemos suspender contas usadas de forma fraudulenta ou abusiva (seção 6).</li>
          </ul>
        </LegalSection>

        <LegalSection id="planos" n={4} title="Planos, preços e cobrança">
          <LegalSub>Plano gratuito</LegalSub>
          <p>
            O plano gratuito não exige cartão e não tem prazo. Ele inclui um objetivo ativo por vez, cronômetro e registro manual, plano semanal e pendências, lembretes básicos e as cotas de materiais informadas na <Link to="/planos">página de planos</Link>.
          </p>
          <LegalSub>Plano Completo</LegalSub>
          <ul>
            <li>O plano Completo é uma assinatura mensal ou anual. Recursos, limites e preços são os publicados na <Link to="/planos">página de planos</Link> no momento da contratação; enquanto o preço não estiver definido, a assinatura não está disponível e nenhuma cobrança acontece.</li>
            <li>O pagamento é processado pelo <strong>Mercado Pago</strong>, no ambiente dele, quando a cobrança estiver habilitada. Não recebemos nem guardamos dados de cartão. A assinatura passa a valer quando o processador confirma o pagamento.</li>
            <li><strong>Não há cobrança por minuto estudado, por sessão ou por objetivo</strong>: o valor é fixo pelo período contratado, use você o serviço muito ou pouco.</li>
            <li>A renovação é automática ao fim de cada período, até você cancelar. Se o pagamento de uma renovação falhar, o serviço concede alguns dias de tolerância e depois volta a conta ao plano gratuito, sem apagar nada.</li>
            <li>Se o preço mudar, a alteração vale apenas para renovações futuras, nunca para o período já pago.</li>
          </ul>
          <LegalSub>Cancelamento</LegalSub>
          <ul>
            <li>Você pode cancelar a qualquer momento, na tela de planos, sem etapas de retenção ou justificativa. O acesso ao plano Completo continua até o fim do período já pago e não há nova cobrança.</li>
            <li>Ao voltar ao plano gratuito, nada é apagado. Se você tiver mais objetivos ativos do que o plano permite, os mais recentes continuam ativos e os demais ficam <strong>pausados</strong> até você escolher; histórico, materiais e exportação continuam disponíveis.</li>
            <li>Reembolso: <Pending>política a definir pelo responsável</Pending>. Até que ela seja definida, o cancelamento interrompe a renovação e não gera estorno do período em curso.</li>
          </ul>
          <LegalSub>Acesso promocional</LegalSub>
          <p>Podemos conceder acesso ao plano Completo por período determinado, sem cobrança. Ao terminar, a conta volta ao plano gratuito pelas mesmas regras acima.</p>
        </LegalSection>

        <LegalSection id="conteudo" n={5} title="Seu conteúdo e seus arquivos">
          <ul>
            <li>Tudo o que você cria ou envia — objetivos, notas, matérias, tópicos, tarefas, links e arquivos PDF — continua sendo seu. Você nos concede apenas a licença necessária para armazenar, processar e exibir esse conteúdo para você, enquanto a conta existir.</li>
            <li>Você declara ter o direito de usar os arquivos que envia. Não fiscalizamos o conteúdo dos arquivos, mas podemos removê-los mediante ordem legal ou notificação fundamentada de violação de direitos.</li>
            <li>Aceitamos apenas PDF, de até 25 MB e 800 páginas por arquivo, dentro das cotas de quantidade e espaço do seu plano. Links precisam usar https.</li>
            <li>Você pode exportar seu conteúdo em JSON e CSV a qualquer momento, em qualquer plano, inclusive após cancelar a assinatura.</li>
          </ul>
        </LegalSection>

        <LegalSection id="uso" n={6} title="Uso aceitável">
          <p>Ao usar o serviço, você se compromete a não:</p>
          <ul>
            <li>tentar acessar contas, dados ou áreas que não sejam suas, nem contornar limites, cotas ou controles de segurança;</li>
            <li>usar automação para sobrecarregar o serviço ou para criar contas em massa;</li>
            <li>enviar arquivos ou textos ilícitos, maliciosos ou que violem direitos de terceiros;</li>
            <li>revender ou sublicenciar o serviço.</li>
          </ul>
          <p>Em caso de violação, podemos limitar, suspender ou encerrar a conta. Sempre que possível, avisaremos antes e daremos oportunidade de exportar seus dados.</p>
        </LegalSection>

        <LegalSection id="ia" n={7} title="Recursos de IA">
          <ul>
            <li>Os recursos de IA são opcionais, podem estar desligados no ambiente e, quando existem, só rodam por ação explícita sua: sugerir estrutura de matérias e tópicos, sugerir distribuição do plano e redigir o resumo da semana.</li>
            <li>Toda resposta é uma <strong>prévia</strong>. Nada é criado ou alterado sem a sua revisão e confirmação. A resposta pode conter erros e você é responsável por conferir antes de aplicar.</li>
            <li>Há limites diários por plano e um limite global. Quando esgotados, o serviço avisa e não envia nada.</li>
            <li>O que é enviado ao provedor e o que guardamos está descrito na <Link to="/privacidade#ia">política de privacidade</Link>.</li>
          </ul>
        </LegalSection>

        <LegalSection id="notificacoes" n={8} title="Lembretes e notificações">
          <p>
            Lembretes por notificação do navegador, push ou e-mail são opcionais e dependem de permissões do seu aparelho e do sistema. Fazemos o melhor para entregá-los no horário, respeitando o limite diário e o horário de silêncio que você configurar, mas <strong>não prometemos entrega pontual</strong>: sistemas operacionais e navegadores podem atrasar ou descartar notificações. Não trate o serviço como alarme.
          </p>
        </LegalSection>

        <LegalSection id="disponibilidade" n={9} title="Disponibilidade e mudanças no serviço">
          <ul>
            <li>Trabalhamos para manter o serviço no ar, mas não garantimos disponibilidade ininterrupta. O aplicativo funciona sem internet para registrar sessões e consultar o plano, e sincroniza quando a conexão voltar; entrar, pagar e importar arquivos exigem conexão.</li>
            <li>Podemos adicionar, alterar ou remover recursos e ajustar limites do catálogo de planos. Mudanças que reduzam recursos de um plano pago valem a partir da renovação seguinte.</li>
            <li>Podemos alterar estes termos. A versão vigente é a publicada nesta página, com a data no topo; mudanças relevantes serão avisadas dentro do aplicativo antes de valer.</li>
          </ul>
        </LegalSection>

        <LegalSection id="encerramento" n={10} title="Encerramento da conta">
          <ul>
            <li><strong>Por você</strong>: em Preferências, a qualquer momento. A exclusão é imediata e irreversível: apaga a conta, o conteúdo de estudo e os arquivos enviados, e encerra a assinatura em curso sem estorno automático. Exporte seus dados antes, se quiser guardá-los.</li>
            <li><strong>Por nós</strong>: em caso de violação destes termos, fraude ou exigência legal, ou se o serviço for descontinuado — neste caso, com aviso prévio e prazo para exportação.</li>
          </ul>
        </LegalSection>

        <LegalSection id="responsabilidade" n={11} title="Responsabilidade">
          <ul>
            <li>O serviço é fornecido “como está”. Não garantimos que ele atenda a toda necessidade específica nem que esteja livre de erros.</li>
            <li>Não respondemos por resultados de estudo, provas, concursos ou avaliações, por decisões tomadas com base nos relatórios, nem por perda de dados causada por falhas do seu aparelho ou do seu navegador (por exemplo, ao limpar os dados do site antes de sincronizar).</li>
            <li>Nossa responsabilidade, quando houver, limita-se ao valor pago por você pelo serviço nos doze meses anteriores ao fato, salvo quando a lei não permitir essa limitação. Nada nestes termos exclui direitos garantidos pelo Código de Defesa do Consumidor.</li>
          </ul>
        </LegalSection>

        <LegalSection id="lei" n={12} title="Lei aplicável e foro">
          <p>
            Estes termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro de <Pending>comarca a definir pelo responsável</Pending> para resolver conflitos, sem prejuízo do foro do seu domicílio quando você for consumidor.
          </p>
        </LegalSection>

        <LegalSection id="contato" n={13} title="Contato">
          <p>
            Dúvidas sobre estes termos: <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a> ou o <Link to="/contato">formulário de contato</Link>.
          </p>
        </LegalSection>
      </LegalDoc>
    </>
  );
}
