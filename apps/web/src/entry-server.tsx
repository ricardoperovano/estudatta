/**
 * Entrada de servidor usada SOMENTE no build, para pré-renderizar as rotas públicas
 * (site de aquisição) em HTML estático. O app privado não é pré-renderizado.
 */
import { renderToString } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { routes } from "./app/routes";
import { headTags, pageMeta } from "./site/seo";
// Aquece os módulos das páginas públicas carregadas com React.lazy em routes.tsx: importados
// estaticamente aqui, entram no mesmo chunk e o import() do lazy resolve em microtarefa.
import "./site/pages/ingles";
import "./site/pages/concursos";
import "./site/pages/planos";
import "./site/pages/faq";
import "./site/pages/contato";
import "./site/pages/privacidade";
import "./site/pages/termos";

const MAX_PASSES = 30;
const PASS_DELAY_MS = 20;

export async function render(url: string): Promise<{ html: string; head: string }> {
  const { query, dataRoutes } = createStaticHandler(routes);
  const context = await query(new Request(`http://localhost${url}`));
  if (context instanceof Response) throw new Error(`redirect for ${url}`);
  const router = createStaticRouter(dataRoutes, context);
  const qc = new QueryClient();
  const pass = () =>
    renderToString(
      <QueryClientProvider client={qc}>
        <StaticRouterProvider router={router} context={context} />
      </QueryClientProvider>,
    );
  // As páginas públicas (exceto a inicial) são carregadas com React.lazy em routes.tsx. Na primeira
  // passagem o componente suspende e renderToString emite o fallback vazio; a passagem dispara o
  // import() e, assim que o módulo resolve, a próxima renderização já é síncrona. Repetimos até o
  // HTML estabilizar (cobre lazies aninhados) para que dist/<rota>/index.html contenha o conteúdo.
  let html = pass();
  let stable = 0;
  for (let i = 0; i < MAX_PASSES && stable < 2; i++) {
    await new Promise((r) => setTimeout(r, PASS_DELAY_MS));
    const next = pass();
    stable = next === html ? stable + 1 : 0;
    html = next;
  }
  const meta = pageMeta[url] ?? { title: "Estudatta", description: "", path: url, noindex: true };
  return { html, head: headTags(meta) };
}
