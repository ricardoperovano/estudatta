/**
 * Entrada de servidor usada SOMENTE no build, para pré-renderizar as rotas públicas
 * (site de aquisição) em HTML estático. O app privado não é pré-renderizado.
 */
import { renderToString } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { routes } from "./app/routes";
import { headTags, pageMeta } from "./site/seo";

export async function render(url: string): Promise<{ html: string; head: string }> {
  const { query, dataRoutes } = createStaticHandler(routes);
  const context = await query(new Request(`http://localhost${url}`));
  if (context instanceof Response) throw new Error(`redirect for ${url}`);
  const router = createStaticRouter(dataRoutes, context);
  const qc = new QueryClient();
  const html = renderToString(
    <QueryClientProvider client={qc}>
      <StaticRouterProvider router={router} context={context} />
    </QueryClientProvider>,
  );
  const meta = pageMeta[url] ?? { title: "Estudatta", description: "", path: url, noindex: true };
  return { html, head: headTags(meta) };
}
