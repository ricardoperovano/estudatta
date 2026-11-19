import { chromium } from "@playwright/test";
import fs from "node:fs";
import crypto from "node:crypto";
const out = process.argv[2];
const BASE = "https://app.estudatta.com.br", API = "https://api.estudatta.com.br";
const statePath = `${out}/sessao-teste.json`;
const pdf = fs.readFileSync(`${out}/teste-digitalizado.pdf`).toString("base64");
const browser = await chromium.launch({ channel: "chrome" });
const resume = fs.existsSync(statePath);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "pt-BR", timezoneId: "America/Sao_Paulo", ...(resume ? { storageState: statePath } : {}) });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERR", String(e).slice(0, 200)));
await page.addLocatorHandler(page.locator("[data-tour-card]"), async (card) => {
  await card.getByRole("button", { name: /Pular tour|Fechar$/ }).first().click();
});
if (!resume) {
  const email = `teste-ocr-${Date.now()}@estudatta.com.br`;
  await page.goto(BASE + "/cadastro", { waitUntil: "networkidle" });
  await page.fill("#name", "Teste OCR (pode excluir)"); await page.fill("#email", email); await page.fill("#password", crypto.randomBytes(12).toString("base64url"));
  const free = page.getByText("Começar no plano gratuito");
  if (await free.count()) await free.first().click();
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.waitForURL("**/onboarding**", { timeout: 20000 });
  await ctx.storageState({ path: statePath });
  console.log("conta de teste criada:", email);
} else {
  await page.goto(BASE + "/app", { waitUntil: "networkidle" });
  console.log("sessão retomada:", page.url());
}
const api = async (method, path, body) => page.evaluate(async ([API, method, path, body]) => {
  const s = await (await fetch(API + "/api/v1/auth/session", { credentials: "include" })).json();
  const r = await fetch(API + path, { method, credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": s.csrf_token }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}, [API, method, path, body]);
let acts = (await api("GET", "/api/v1/activities")).json;
let actId = Array.isArray(acts) && acts[0]?.id;
if (!actId) {
  const act = await api("POST", "/api/v1/activities", { title: "Teste de OCR", category: "concurso", goal: { daily_minutes: 60, active_days: [0, 1, 2, 3, 4], daily_limit_minutes: 120 } });
  console.log("objetivo:", act.status, JSON.stringify(act.json).slice(0, 120)); actId = act.json.id;
  await api("POST", "/api/v1/me/onboarding", { completed: true });
}
const up = await page.evaluate(async ([API, b64, actId]) => {
  const s = await (await fetch(API + "/api/v1/auth/session", { credentials: "include" })).json();
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const fd = new FormData();
  fd.append("file", new Blob([bytes], { type: "application/pdf" }), "teste-digitalizado.pdf");
  fd.append("activity_id", actId);
  const r = await fetch(API + "/api/v1/imports", { method: "POST", credentials: "include", headers: { "X-CSRF-Token": s.csrf_token }, body: fd });
  return { status: r.status, json: await r.json().catch(() => null) };
}, [API, pdf, actId]);
console.log("envio:", up.status, up.json?.status, up.json?.error?.message ?? "");
if (up.status !== 201) { await browser.close(); process.exit(1); }
const id = up.json.id; const t0 = Date.now(); let job = up.json; const seen = [job.status];
while (["queued", "processing"].includes(job.status) && Date.now() - t0 < 240000) {
  await page.waitForTimeout(3000);
  job = (await api("GET", `/api/v1/imports/${id}`)).json;
  if (seen.at(-1) !== job.status) seen.push(job.status);
}
console.log("estados:", seen.join(" → "), `em ${Math.round((Date.now() - t0) / 1000)}s`);
console.log("resultado:", job.status, job.error_code ?? "", job.error_message ?? "", JSON.stringify(job.proposal?.stats ?? {}));
for (const s of job.proposal?.subjects ?? []) console.log("  #", s.title, "|", s.topics.map((t) => `${t.title} (${t.children.length})`).join("; "));
await page.goto(`${BASE}/app/importar?importacao=${id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.locator('[data-tour="importar-revisao"]').screenshot({ path: `${out}/prod-ocr-revisao.png` }).catch((e) => console.log("sem cartão de revisão", String(e).slice(0, 80)));
if (job.status === "needs_review") {
  const c = await api("POST", `/api/v1/imports/${id}/confirm`);
  console.log("confirmação:", c.status, c.json?.created_subjects, "matérias,", c.json?.created_topics, "tópicos");
}
await browser.close();
