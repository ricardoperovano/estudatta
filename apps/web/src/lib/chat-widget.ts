/**
 * Bolha de atendimento (Monitchat) sem atrapalhar a interface do app.
 *
 * O widget se posiciona em `bottom: 16px` dentro do próprio shadow DOM, com z-index máximo:
 * de fora da sombra, nenhum CSS da página alcança a bolha. Como o shadow root é aberto, o app
 * injeta lá dentro uma regra que lê duas variáveis CSS — e variáveis atravessam a sombra, então
 * o app controla a bolha definindo-as no `<html>`:
 *
 *   --chat-bottom-offset  quanto subir (a barra de navegação declara a própria altura)
 *   --chat-display        `none` enquanto uma folha ou diálogo está aberto na frente
 *
 * Sem o widget na página (offline, bloqueador, script fora do ar), tudo isto é inócuo.
 */
const ID = "monitchat-widget";
const MARCA = "data-estudatta-offset";
// `block` é o display próprio do widget; repetido aqui porque a regra precisa de um valor padrão
const CSS = `
.mcw-root { display: var(--chat-display, block) !important; }
@media (max-width: 767px) {
  .mcw-root { bottom: calc(16px + var(--chat-bottom-offset, 0px)) !important; }
}
`;

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
