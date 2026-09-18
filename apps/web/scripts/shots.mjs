/**
 * Captura telas implementadas nas mesmas dimensões das referências (390×844 mobile, 1440×900 desktop)
 * para comparação visual com os mockups. Uso:
 *   node scripts/shots.mjs [baseURL] [email] [senha]
 * Padrão: http://localhost:5180 e o usuário de demonstração (DEMO_EMAIL/DEMO_PASSWORD).
 * Saída: ../../docs/visual-comparison/implemented/<nome>.png
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const base = process.argv[2] || process.env.BASE_URL || "http://localhost:5180";
const email = process.argv[3] || process.env.DEMO_EMAIL || "demo@estudatta.com.br";
const password = process.argv[4] || process.env.DEMO_PASSWORD || "";
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../docs/visual-comparison/implemented");
fs.mkdirSync(outDir, { recursive: true });

const publicPages = [
  ["landing", "/"],
  ["ingles", "/ingles"],
  ["concursos", "/concursos"],
  ["planos-site", "/planos"],
  ["faq", "/faq"],
];
const appPages = [
  ["hoje", "/app"],
  ["sessao", "/app/sessao"],
  ["plano", "/app/plano"],
  ["objetivos", "/app/objetivos"],
  ["relatorio", "/app/relatorio"],
  ["preferencias", "/app/preferencias"],
  ["planos", "/app/planos"],
  ["materiais", "/app/materiais"],
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const [name, viewport, mobile] of [
  ["mobile", { width: 390, height: 844 }, true],
  ["desktop", { width: 1440, height: 900 }, false],
]) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, deviceScaleFactor: 1, locale: "pt-BR", timezoneId: "America/Sao_Paulo", colorScheme: "dark" });
  const page = await ctx.newPage();
  for (const [slug, route] of publicPages) {
    await page.goto(base + route, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, `${name}-${slug}.png`), fullPage: name === "desktop" });
  }
  if (password) {
    await page.goto(base + "/entrar", { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(outDir, `${name}-entrar.png`) });
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/app/, { timeout: 15000 }).catch(() => {});
    for (const [slug, route] of appPages) {
      await page.goto(base + route, { waitUntil: "networkidle" });
      await page.locator('[role="status"][aria-label="Carregando"]').first().waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(outDir, `${name}-${slug}.png`), fullPage: name === "desktop" });
    }
    if (name === "desktop") {
      // relatório em tema claro (D3)
      await page.goto(base + "/app/relatorio", { waitUntil: "networkidle" });
      await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, `desktop-relatorio-claro.png`), fullPage: true });
    }
  }
  await ctx.close();
}
await browser.close();
console.log("capturas em", outDir);
