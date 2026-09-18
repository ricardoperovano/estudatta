/**
 * Pré-renderização das rotas públicas (compatível com Vite): gera dist/<rota>/index.html a partir
 * do bundle de servidor. As rotas privadas continuam como SPA (dist/app.html → fallback do Nginx/SW).
 * Também escreve sitemap.xml e robots.txt (rotas privadas fora da indexação).
 */
import { build } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const siteUrl = process.env.VITE_SITE_URL || "https://estudatta.com.br";
const PUBLIC_ROUTES = ["/", "/ingles", "/concursos", "/planos", "/faq", "/contato", "/privacidade", "/termos"];

// 1) bundle de servidor temporário
await build({
  root,
  configFile: path.join(root, "vite.config.ts"),
  logLevel: "warn",
  build: { ssr: "src/entry-server.tsx", outDir: "dist-ssr", emptyOutDir: true, rollupOptions: { output: { format: "es" } } },
});

const template = fs.readFileSync(path.join(dist, "index.html"), "utf8");
// app.html = shell vazio para rotas privadas (fallback), com <head> genérico e noindex
fs.writeFileSync(
  path.join(dist, "app.html"),
  template.replace("<!--app-head-->", '<title>Estudatta</title>\n    <meta name="robots" content="noindex, nofollow">').replace("<!--app-html-->", ""),
);

const { render } = await import(pathToFileURL(path.join(root, "dist-ssr", "entry-server.js")).href);

for (const route of PUBLIC_ROUTES) {
  try {
    const { html, head } = await render(route);
    const page = template
      .replace("<!--app-head-->", head)
      .replace('<div id="root"><!--app-html--></div>', `<div id="root" data-prerendered="1">${html}</div>`);
    const outDir = route === "/" ? dist : path.join(dist, route.slice(1));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), page);
    console.log(`prerendered ${route}`);
  } catch (e) {
    console.error(`falha ao pré-renderizar ${route}:`, e);
    process.exitCode = 1;
  }
}

fs.writeFileSync(
  path.join(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PUBLIC_ROUTES.map((r) => `  <url><loc>${siteUrl}${r}</loc></url>`).join("\n")}\n</urlset>\n`,
);
fs.writeFileSync(path.join(dist, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /admin\nDisallow: /api\nDisallow: /entrar\nDisallow: /cadastro\nDisallow: /onboarding\nSitemap: ${siteUrl}/sitemap.xml\n`);
fs.rmSync(path.join(root, "dist-ssr"), { recursive: true, force: true });
console.log("prerender ok");
