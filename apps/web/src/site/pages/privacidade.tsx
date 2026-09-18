import { Link } from "react-router";
import { Seo, pageMeta } from "../seo";
import { LegalDoc, LegalSection, LegalSub, Pending } from "../sections/legal";
import { brand } from "@/design/brand";

const toc = [
  { id: "quem", label: "Quem é o responsável e a que esta política se aplica" },
  { id: "dados", label: "Quais dados coletamos" },
  { id: "uso", label: "Para que usamos os dados" },
  { id: "cookies", label: "Cookies e armazenamento no aparelho" },
  { id: "terceiros", label: "Com quem os dados são compartilhados" },
  { id: "ia", label: "Recursos de IA (opcionais)" },
  { id: "materiais", label: "Materiais enviados e importação" },
  { id: "retencao", label: "Por quanto tempo guardamos" },
  { id: "direitos", label: "Seus direitos: exportar, corrigir e excluir" },
  { id: "seguranca", label: "Segurança" },
  { id: "alteracoes", label: "Alterações desta política" },
  { id: "contato", label: "Contato e encarregado" },
];

const pending = [
  "razão social e CNPJ do responsável",
  "endereço",
  "nome e e-mail do encarregado (DPO)",
  "prazo de retenção dos registros operacionais",
  "identificação do provedor de armazenamento de arquivos e do provedor de IA em produção",
];

/** Política de privacidade em pt-BR, escrita a partir do comportamento implementado no backend. */
export default function PrivacidadePage() {
  return (
    <>
      <Seo {...pageMeta["/privacidade"]} />
      <LegalDoc
        kicker="Privacidade"
        title="Como o Estudatta trata seus dados"
        lead="Esta página explica, em linguagem direta, quais dados o serviço coleta, para que os usa, com quem os compartilha e como você exporta ou apaga tudo. Ela descreve o que o serviço faz — não é um atestado de conformidade."
        pending={pending}
        toc={toc}
      >
        <LegalSection id="quem" n={1} title="Quem é o responsável e a que esta política se aplica">
          <p>
            O {brand.name} é operado por <Pending>razão social a definir pelo responsável</Pending>, CNPJ <Pending>a definir pelo responsável</Pending>, com endereço em <Pending>a definir pelo responsável</Pending> (“nós”). Esta política se aplica ao site <strong>{brand.domain}</strong>, ao aplicativo web que ele hospeda e à API que o atende.
          </p>
          <p>
            O serviço é um planejador de estudo e prática: você define um objetivo, uma meta de tempo e os dias da semana; o serviço organiza o plano, registra as sessões e transforma o que faltou em tempo a recuperar. Tratamos dados pessoais para prestar exatamente isso, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
          </p>
        </LegalSection>

        <LegalSection id="dados" n={2} title="Quais dados coletamos">
          <LegalSub>Dados da conta</LegalSub>
          <ul>
            <li><strong>E-mail</strong> (obrigatório; usado como identificador de acesso e para os e-mails descritos na seção 3).</li>
            <li><strong>Nome</strong> (opcional) e <strong>fuso horário</strong> (padrão América/São Paulo), usados para montar o plano no seu horário local. Idioma da interface (padrão pt-BR).</li>
            <li><strong>Senha</strong>, armazenada apenas como hash criptográfico. Nunca guardamos a senha em texto.</li>
            <li>Se você entrar com Google (quando esse login estiver habilitado): o identificador da sua conta Google, o e-mail e o nome informados pelo Google. Não recebemos sua senha do Google.</li>
            <li>Datas de criação da conta, de confirmação do e-mail e do último acesso.</li>
          </ul>
          <LegalSub>Dados que você cria ao usar o serviço</LegalSub>
          <ul>
            <li>Objetivos (título, descrição, categoria, resultado desejado, datas, prazo da prova, dias e horários disponíveis), regras de meta e pausas planejadas (com o motivo, se você escrever um).</li>
            <li>Matérias, tópicos, tarefas e materiais: títulos, descrições, links, intervalos de páginas, posição de leitura e os arquivos PDF que você enviar.</li>
            <li>Sessões de estudo: início, fim, duração, tópico, páginas, observações em texto livre, configuração de pomodoro, fuso horário e o identificador do aparelho em que foram registradas.</li>
            <li>Preferências: tema, tom das mensagens (acolhedor, direto ou firme), primeiro dia da semana, duração padrão de sessão, movimento reduzido, e a sua resposta sobre consentimento para métricas de uso (sim, não ou sem resposta).</li>
            <li>Preferências de lembretes: canais (aplicativo, push, e-mail), horários, dias, horário de silêncio, limite diário e se o nome do objetivo aparece na notificação (por padrão, não aparece).</li>
          </ul>
          <LegalSub>Dados técnicos e de segurança</LegalSub>
          <ul>
            <li>Para cada sessão de acesso: endereço IP, identificação do navegador (até 300 caracteres), um rótulo do tipo de aparelho (“iPhone/iPad”, “Android”, “Windows”, “Mac”, “Linux” ou “Navegador”), data de criação, de expiração e do último uso.</li>
            <li>Um identificador aleatório do aparelho, gerado pelo próprio navegador e enviado em cada requisição, usado para sincronizar o registro feito sem internet e evitar duplicidade.</li>
            <li>Registros de auditoria de ações sensíveis (criação de conta, entrada, troca de senha, exclusão da conta, envio e exclusão de materiais, importações, assinatura de push, ações de cobrança e ações administrativas), com data, IP e identificador da requisição.</li>
            <li>Fila de notificações e resultado das entregas. Nos registros de entrega de push guardamos apenas um resumo criptográfico do endereço da assinatura, não o endereço em si.</li>
          </ul>
          <LegalSub>Contato e novidades</LegalSub>
          <p>
            Se você usar o formulário de <Link to="/contato">contato</Link>, guardamos nome (opcional), e-mail, assunto e mensagem. Se deixar o e-mail para receber novidades, guardamos o e-mail e a origem do cadastro.
          </p>
          <LegalSub>Pagamento (quando a cobrança estiver habilitada)</LegalSub>
          <p>
            Guardamos o plano contratado, os identificadores da assinatura e do pagador atribuídos pelo processador de pagamento, o status, o período vigente, o valor e a moeda, além dos eventos que o processador nos envia sobre a assinatura. <strong>Nunca recebemos nem armazenamos número de cartão, código de segurança, CPF ou endereço de cobrança</strong>: o pagamento é concluído no ambiente do processador (seção 5).
          </p>
          <LegalSub>O que não coletamos</LegalSub>
          <p>
            Não coletamos localização, contatos, câmera ou microfone. Não usamos, hoje, nenhum serviço de métricas de uso, pixel de rastreamento ou cookie de terceiros no site ou no aplicativo.
          </p>
        </LegalSection>

        <LegalSection id="uso" n={3} title="Para que usamos os dados">
          <ul>
            <li><strong>Prestar o serviço</strong>: calcular a meta de hoje, o saldo, a pendência e a recuperação sugerida; manter o plano sincronizado entre seus aparelhos; funcionar sem internet e sincronizar depois. Base legal: execução do contrato.</li>
            <li><strong>E-mails transacionais</strong>: existem apenas três — confirmação de e-mail (link válido por 24 horas), redefinição de senha (link válido por 1 hora) e o resumo semanal, que só é enviado se você ativar o canal de e-mail e o resumo semanal nas preferências (ambos desligados por padrão). Não enviamos e-mail de marketing.</li>
            <li><strong>Lembretes</strong>: notificações dentro do aplicativo e, se você permitir no navegador, notificações push (seção 5). O serviço limita a quantidade diária, respeita o horário de silêncio e cancela lembretes que perderam o sentido (por exemplo, quando a sessão já foi registrada). Base legal: consentimento, revogável nas preferências.</li>
            <li><strong>Segurança</strong>: limitar tentativas de entrada e de recuperação de senha, detectar uso indevido, manter registros de auditoria e permitir que você veja e encerre sessões em outros aparelhos. Base legal: legítimo interesse e cumprimento de obrigações legais.</li>
            <li><strong>Cobrança</strong> (quando habilitada): iniciar, acompanhar e cancelar a assinatura e aplicar os limites do plano. Base legal: execução do contrato.</li>
            <li><strong>Atendimento</strong>: responder às mensagens enviadas pelo formulário de contato, no e-mail que você informar.</li>
            <li><strong>Recursos de IA</strong>, apenas quando habilitados e apenas quando você pedir (seção 6). Base legal: consentimento, manifestado a cada ação.</li>
          </ul>
          <p>Não vendemos dados pessoais e não usamos seus dados para publicidade.</p>
        </LegalSection>

        <LegalSection id="cookies" n={4} title="Cookies e armazenamento no aparelho">
          <ul>
            <li><strong>Cookie de sessão</strong> <code className="rounded-sm bg-surface px-1 text-[14px]">estudatta_session</code>: próprio (primeira parte), <strong>HttpOnly</strong> (inacessível a scripts), <strong>SameSite=Lax</strong>, marcado como seguro em produção, válido por <strong>30 dias</strong>. Contém apenas um identificador aleatório; o servidor guarda somente o hash dele. É apagado ao sair ou ao encerrar a sessão.</li>
            <li><strong>Sem cookies de terceiros</strong> e sem cookies de publicidade ou de métricas.</li>
            <li><strong>Armazenamento local do navegador</strong> (localStorage e IndexedDB): identificador do aparelho, tema escolhido, data da última sincronização, um instantâneo da tela Hoje, o plano sincronizado, a fila de registros feitos sem internet e o estado do cronômetro. Serve para o aplicativo abrir e funcionar sem conexão. <strong>Nunca guarda senha nem credenciais.</strong> Você apaga tudo isso limpando os dados do site no navegador.</li>
            <li><strong>Token contra falsificação de requisições (CSRF)</strong>: entregue ao aplicativo ao entrar e enviado em cabeçalho a cada alteração; não é cookie.</li>
            <li><strong>Métricas de uso</strong>: não há nenhum provedor habilitado hoje. Se um for habilitado no futuro, será carregado apenas com o seu consentimento, registrado na preferência correspondente da sua conta, e esta política será atualizada com o nome do provedor.</li>
          </ul>
        </LegalSection>

        <LegalSection id="terceiros" n={5} title="Com quem os dados são compartilhados">
          <p>Compartilhamos dados apenas com operadores necessários ao funcionamento do serviço, cada um limitado ao mínimo. Todos abaixo são opcionais e dependem de configuração do ambiente:</p>
          <ul>
            <li><strong>Mercado Pago</strong> (processamento de pagamento, quando a cobrança estiver habilitada): recebe o seu e-mail, a descrição do plano, o valor, a periodicidade e uma referência aleatória sem dados pessoais. O pagamento em si acontece no site do Mercado Pago, sob a política de privacidade dele.</li>
            <li><strong>Provedor de IA</strong> (quando os recursos de IA estiverem habilitados): recebe apenas o trecho necessário à ação que você pediu, conforme a seção 6. Provedor em produção: <Pending>a definir pelo responsável</Pending>.</li>
            <li><strong>Serviços de notificação push do navegador</strong> (operados pelo fabricante do navegador ou do sistema, como os do Google, da Mozilla e da Apple): recebem o conteúdo da notificação, criptografado para a sua assinatura. Só acontece se você permitir notificações.</li>
            <li><strong>Google</strong> (apenas se você escolher entrar com Google): troca de identificação conforme o protocolo OpenID Connect, com os escopos e-mail e perfil.</li>
            <li><strong>Servidor de e-mail (SMTP)</strong> configurado pelo responsável, para os três e-mails transacionais. Remetente: no-reply@{brand.domain}.</li>
            <li><strong>Armazenamento de arquivos</strong> para os PDFs enviados: disco próprio ou serviço compatível com S3, em área privada. Provedor em produção: <Pending>a definir pelo responsável</Pending>.</li>
          </ul>
          <p>Fora isso, dados só são compartilhados por obrigação legal ou ordem de autoridade competente.</p>
        </LegalSection>

        <LegalSection id="ia" n={6} title="Recursos de IA (opcionais)">
          <ul>
            <li>Os recursos de IA vêm <strong>desligados por padrão</strong>. Quando desligados, o aplicativo informa isso e você organiza tudo manualmente.</li>
            <li>Quando habilitados, só são acionados por <strong>ação explícita sua</strong>, em três situações: sugerir a estrutura de matérias e tópicos a partir de um texto ou de uma importação; sugerir uma distribuição de plano; redigir o resumo da semana. Nada roda em segundo plano.</li>
            <li><strong>O que é enviado</strong>: apenas o trecho necessário — o texto que você colou ou extraiu (limitado a 60 mil caracteres, com aviso quando houver corte), ou o título do objetivo e os números do período (minutos, dias, pendência), ou os títulos dos tópicos e a disponibilidade dos dias. Não enviamos seu e-mail, nome ou identificadores de conta. O texto é enviado como dado a ser analisado, com instrução para não ser interpretado como comando.</li>
            <li><strong>O que guardamos</strong>: nos nossos registros de uso ficam apenas contadores — ação, modelo, quantidade de caracteres e de tokens, tempo de resposta e código de erro. Não registramos o conteúdo enviado nem a resposta.</li>
            <li><strong>Toda resposta é prévia</strong>: nada muda no seu plano até você revisar e confirmar. A resposta é validada e o resumo semanal passa por um filtro que barra promessas e culpa.</li>
            <li>Há limites diários por plano e um limite global; quando esgotados, o aplicativo avisa e nada é enviado.</li>
          </ul>
        </LegalSection>

        <LegalSection id="materiais" n={7} title="Materiais enviados e importação">
          <ul>
            <li>Aceitamos apenas arquivos <strong>PDF</strong>, verificados pelo conteúdo (não só pela extensão), de até <strong>25 MB</strong> e <strong>800 páginas</strong>. Você também pode cadastrar links (somente https) e livros físicos sem enviar arquivo.</li>
            <li>Os arquivos ficam em área privada, identificados pela sua conta. Para abrir ou baixar, o aplicativo gera um link assinado que expira em <strong>10 minutos</strong>.</li>
            <li>Na importação de conteúdo programático (texto colado, CSV ou PDF), extraímos apenas a camada de texto do PDF e guardamos esse texto junto com a proposta de matérias e tópicos, para que você revise. <strong>Não fazemos OCR</strong>: PDFs digitalizados como imagem são recusados com aviso. Nada é criado sem a sua confirmação.</li>
            <li>Excluir um material apaga o arquivo do armazenamento. Excluir a conta apaga todos os seus arquivos.</li>
            <li>Você é responsável por ter o direito de usar os arquivos que envia; não os analisamos nem os compartilhamos com terceiros além do descrito na seção 5.</li>
          </ul>
        </LegalSection>

        <LegalSection id="retencao" n={8} title="Por quanto tempo guardamos">
          <ul>
            <li><strong>Dados da conta e conteúdo de estudo</strong>: enquanto a conta existir. Ao excluir a conta, são apagados imediatamente (seção 9).</li>
            <li><strong>Sessões de acesso expiradas e tokens de uso único</strong>: apagados automaticamente 7 dias após expirar.</li>
            <li><strong>Fila de notificações e registros de entrega</strong>: apagados automaticamente após 90 dias.</li>
            <li><strong>Registros operacionais</strong> — auditoria de ações, eventos recebidos do processador de pagamento, contadores de uso de IA, mensagens de contato, cadastro para novidades e fila de sincronização —: mantidos por <Pending>período a definir pelo responsável</Pending>, de forma anonimizada após a exclusão da conta.</li>
            <li><strong>Dados fiscais e de cobrança</strong> exigidos por lei: pelo prazo legal aplicável.</li>
          </ul>
        </LegalSection>

        <LegalSection id="direitos" n={9} title="Seus direitos: exportar, corrigir e excluir">
          <p>Você exerce a maior parte dos direitos diretamente no aplicativo, sem pedir a ninguém:</p>
          <ul>
            <li><strong>Acesso e portabilidade</strong>: em Preferências, exporte tudo em JSON (conta, objetivos, matérias, tópicos, materiais, tarefas, sessões) ou o histórico de sessões em CSV. Os PDFs enviados podem ser baixados um a um pela tela de materiais. A exportação <strong>não depende de assinatura</strong>.</li>
            <li><strong>Correção</strong>: edite nome, fuso horário, idioma, preferências e todo o conteúdo de estudo a qualquer momento.</li>
            <li><strong>Exclusão</strong>: em Preferências, confirme a exclusão da conta digitando a palavra pedida e, se houver senha, a senha. A exclusão é <strong>imediata e irreversível</strong>: apaga conta, objetivos, sessões, materiais (inclusive os arquivos), notificações, assinaturas de push, preferências e importações. Permanecem apenas registros de auditoria, contadores de uso de IA e eventos de cobrança, <strong>sem vínculo com a sua identidade</strong>. Exporte antes se quiser guardar uma cópia.</li>
            <li><strong>Revogar consentimentos</strong>: desative push, e-mail e resumo semanal nas preferências de lembretes; não use os recursos de IA; encerre sessões em outros aparelhos na tela de sessões.</li>
            <li><strong>Cancelar a assinatura</strong> (quando houver): na tela de planos, sem obstáculos. Cancelar não apaga nada.</li>
          </ul>
          <p>
            Para pedidos que o aplicativo não cobre (por exemplo, informação sobre compartilhamentos específicos ou oposição a um tratamento), escreva para <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>. Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).
          </p>
        </LegalSection>

        <LegalSection id="seguranca" n={10} title="Segurança">
          <ul>
            <li>Senhas armazenadas com hash de propósito específico; mínimo de 8 caracteres.</li>
            <li>Tokens de confirmação e de redefinição de senha aleatórios, de uso único, guardados apenas como hash; redefinir a senha encerra todas as sessões abertas.</li>
            <li>Cookie de sessão HttpOnly, verificação de origem e token CSRF em toda alteração; limites de tentativas por endereço e por conta.</li>
            <li>Cabeçalhos de proteção do navegador em todas as respostas e proibição de cache nas respostas da API.</li>
            <li>Área administrativa restrita, com todas as ações auditadas. Não existe — nem existirá — “entrar como usuário”: a administração vê apenas totais agregados, nunca o conteúdo do seu estudo, suas notas ou seus arquivos.</li>
          </ul>
          <p>Nenhum sistema é infalível. Se identificarmos um incidente que afete seus dados, comunicaremos você e as autoridades conforme a lei exigir. Esta seção descreve medidas adotadas; ela não afirma certificação ou auditoria externa.</p>
        </LegalSection>

        <LegalSection id="alteracoes" n={11} title="Alterações desta política">
          <p>
            A versão vigente é a publicada nesta página, com a data indicada no topo. Se uma alteração ampliar o uso dos seus dados ou habilitar um novo operador (por exemplo, métricas de uso ou um provedor de IA), avisaremos dentro do aplicativo antes de ela passar a valer.
          </p>
        </LegalSection>

        <LegalSection id="contato" n={12} title="Contato e encarregado">
          <p>
            Dúvidas, pedidos e reclamações sobre dados pessoais: <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a> ou o <Link to="/contato">formulário de contato</Link>.
          </p>
          <p>
            Encarregado pelo tratamento de dados pessoais (DPO): <Pending>nome e e-mail a definir pelo responsável</Pending>.
          </p>
        </LegalSection>
      </LegalDoc>
    </>
  );
}
