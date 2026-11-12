/**
 * Atendimento (Monitchat) sem atrapalhar a interface do app.
 *
 * O widget desenha a bolha dentro do próprio shadow DOM, com z-index máximo: de fora da sombra,
 * nenhum CSS da página a alcança. Como o shadow root é aberto, o app injeta uma regra lá dentro:
 *
 * - no celular a bolha flutuante não aparece: a tela é pequena e ela caía em cima da barra de
 *   navegação, de botões de folhas e do cartão do tour. O chat continua a um toque, pelo botão
 *   "Conversar com o suporte" (Preferências › Ajuda e menu do perfil), que chama `abrirAtendimento`;
 * - em telas maiores a bolha fica no canto e some enquanto uma folha ou diálogo está aberto
 *   (`--chat-display`, variável que atravessa a sombra).
 *
 * Sem o widget na página (offline, bloqueador, script fora do ar), tudo isto é inócuo.
 */
const ID = "monitchat-widget";
const MARCA = "data-estudatta-offset";
// `block` é o display próprio do widget; repetido aqui porque a regra precisa de um valor padrão
const CSS = `
.mcw-root { display: var(--chat-display, block) !important; }
@media (max-width: 767px) {
  .mcw-bubble { display: none !important; }
}
`;

interface MonitchatApi {
  open?: () => void;
}

/** Abre o chat de atendimento. Devolve false se o widget não está na página. */
export function abrirAtendimento(): boolean {
  const api = (window as unknown as { MonitchatWidget?: MonitchatApi }).MonitchatWidget;
  if (!api?.open || !document.getElementById(ID)) return false;
  // um diálogo aberto esconde o widget inteiro; o chat pedido explicitamente tem prioridade
  document.documentElement.style.removeProperty("--chat-display");
  api.open();
  return true;
}

function injeta(host: Element): boolean {
  const raiz = (host as HTMLElement).shadowRoot;
  if (!raiz || raiz.querySelector(`style[${MARCA}]`)) return false;
  const style = document.createElement("style");
  style.setAttribute(MARCA, "");
  style.textContent = CSS;
  raiz.appendChild(style);
  return true;
}

/** Observa até o widget aparecer; desiste depois de 30s para não ficar observando à toa. */
export function ajustarBolhaDeAtendimento(): void {
  if (typeof document === "undefined") return;
  const existente = document.getElementById(ID);
  if (existente && injeta(existente)) return;

  const observador = new MutationObserver(() => {
    const host = document.getElementById(ID);
    if (host && injeta(host)) {
      observador.disconnect();
      window.clearTimeout(desistir);
    }
  });
  observador.observe(document.body, { childList: true, subtree: false });
  const desistir = window.setTimeout(() => observador.disconnect(), 30_000);
}

/**
 * Esconde a bolha enquanto algo está aberto na frente dela (folha de encerrar sessão, diálogos).
 * Devolve a função que desfaz. Conta aberturas, para que fechar um diálogo de cima não revele a
 * bolha enquanto outro continua aberto.
 */
let abertos = 0;

export function esconderBolhaDeAtendimento(): () => void {
  if (typeof document === "undefined") return () => {};
  abertos += 1;
  document.documentElement.style.setProperty("--chat-display", "none");
  let desfeito = false;
  return () => {
    if (desfeito) return;
    desfeito = true;
    abertos = Math.max(0, abertos - 1);
    if (abertos === 0) document.documentElement.style.removeProperty("--chat-display");
  };
}
