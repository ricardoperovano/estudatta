/**
 * Bolha de atendimento (Monitchat) sem cobrir a navegação.
 *
 * O widget se posiciona em `bottom: 16px` dentro do próprio shadow DOM, o que no celular cai
 * exatamente em cima da barra de navegação inferior (64px) e esconde o último item. Como o
 * shadow root é aberto, dá para injetar uma regra lá dentro; ela lê `--chat-bottom-offset`, que
 * a navegação define enquanto está na tela (ver `BottomNav`). Sem a barra, o valor é 0 e a bolha
 * fica onde o widget quer.
 *
 * Se o widget não carregar (offline, bloqueador, script fora do ar), nada acontece.
 */
const ID = "monitchat-widget";
const MARCA = "data-estudatta-offset";
const CSS = `
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
    // o shadow root nasce junto com o elemento, mas tolera-se o contrário
    if (host && injeta(host)) {
      observador.disconnect();
      window.clearTimeout(desistir);
    }
  });
  observador.observe(document.body, { childList: true, subtree: false });
  const desistir = window.setTimeout(() => observador.disconnect(), 30_000);
}
