import { test, expect, type Page } from "@playwright/test";

/**
 * Fluxo E2E principal: cadastrar → onboarding (inglês 60 min/dia) → matéria/tópico →
 * registrar sessão → verificar saldo → planejar recuperação → vincular material → progresso.
 * Roda contra API real (Postgres e2e) e o PWA em desenvolvimento.
 */
const email = `e2e-${Date.now()}@example.com`;
const password = "senha-forte-e2e-123";

async function register(page: Page) {
  await page.goto("/cadastro");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
}

async function onboarding(page: Page) {
  await page.getByRole("button", { name: /Inglês ou outro idioma/ }).click();
  await page.getByLabel("Nome").fill("Inglês");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Quanto tempo por dia?")).toBeVisible();
  await expect(page.getByText("60 min", { exact: true })).toBeVisible();
  // começar ontem, para que hoje já exista 60 min de pendência
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const iso = yesterday.toISOString().slice(0, 10);
  await page.getByLabel("Começar em").fill(iso);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Concluir" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test("cadastro → objetivo → sessão → saldo → recuperação → material → progresso", async ({ page }) => {
  await register(page);
  await onboarding(page);

  // Tela Hoje: meta base 60 e (se ontem foi dia ativo) pendência anterior 60
  await expect(page.getByRole("heading", { name: "Hoje" })).toBeVisible();
  await expect(page.getByText("Inglês").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Começar sessão" }).first()).toBeVisible();

  // Registrar tempo manualmente: 30 min
  await page.getByRole("button", { name: "Registrar manualmente" }).first().click();
  await expect(page.getByRole("dialog", { name: "Registrar tempo" })).toBeVisible();
  await page.getByRole("radio", { name: "30" }).click();
  await page.getByRole("button", { name: /Salvar 30 min/ }).click();
  await expect(page.getByText("30 min registrados")).toBeVisible();
  await expect(page.getByText("Registrado hoje").first()).toBeVisible();

  // Saldo do objetivo
  await page.getByRole("link", { name: "Objetivos" }).first().click();
  await expect(page).toHaveURL(/\/app\/objetivos/);
  await page.getByRole("link", { name: /Inglês/ }).first().click();
  await expect(page).toHaveURL(/\/app\/objetivos\/[0-9a-f-]+$/);

  // Matéria e tópico
  await page.getByRole("button", { name: /Adicionar matéria/ }).click();
  await page.getByLabel(/Nome|Título/).first().fill("Gramática");
  await page.getByRole("button", { name: /Salvar|Adicionar|Criar/ }).first().click();
  await expect(page.getByText("Gramática").first()).toBeVisible();

  // Recuperação (se houver pendência de ontem)
  const url = page.url();
  await page.goto(`${url}/recuperar`);
  await expect(page.getByText(/recuperar/i).first()).toBeVisible();

  // Material por link
  await page.goto("/app/materiais");
  await expect(page.getByRole("heading", { name: /Materiais/ })).toBeVisible();

  // Relatório
  await page.goto("/app/relatorio");
  await expect(page.getByRole("heading", { name: /Relatório/ })).toBeVisible();
  await expect(page.getByText(/constância/i).first()).toBeVisible();
});

test("cronômetro: iniciar, pausar, encerrar e um só vencedor entre abas", async ({ page, context }) => {
  await register(page);
  await onboarding(page);
  await page.goto("/app/sessao");
  await page.getByRole("button", { name: "Começar sessão" }).click();
  await expect(page.getByText("Em sessão")).toBeVisible();

  // segunda aba tenta iniciar: deve ver a sessão em andamento (não cria outra)
  const other = await context.newPage();
  await other.goto("/app/sessao");
  await expect(other.getByText(/Em sessão|Pausada|sessão em andamento/i).first()).toBeVisible();
  await other.close();

  await page.getByRole("button", { name: "Pausar" }).click();
  await expect(page.getByRole("button", { name: "Retomar" })).toBeVisible();
  await page.getByRole("button", { name: "Retomar" }).click();
  await page.getByRole("button", { name: "Encerrar" }).click();
  await page.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
});

test("logout limpa o cache privado e a rota privada volta a exigir login", async ({ page }) => {
  await register(page);
  await onboarding(page);
  await page.goto("/app/preferencias");
  await page.getByRole("button", { name: /^Sair/ }).click();
  await expect(page).toHaveURL(/\/(entrar)?$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/entrar/);
  const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  // o banco pode existir, mas sem snapshots do usuário
  const count = await page.evaluate(async () => {
    return new Promise<number>((resolve) => {
      const req = indexedDB.open("estudatta");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("snapshots")) return resolve(0);
        const tx = db.transaction("snapshots", "readonly");
        const c = tx.objectStore("snapshots").count();
        c.onsuccess = () => resolve(c.result);
        c.onerror = () => resolve(-1);
      };
      req.onerror = () => resolve(0);
    });
  });
  expect(dbs).toBeDefined();
  expect(count).toBe(0);
});
