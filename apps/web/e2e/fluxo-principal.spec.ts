import { test, expect, type Page } from "@playwright/test";

/**
 * Fluxo E2E principal: cadastrar → onboarding (inglês 60 min/dia) → matéria/tópico →
 * registrar sessão → verificar saldo → planejar recuperação → vincular material → progresso.
 * Roda contra API real (Postgres e2e) e o PWA em desenvolvimento.
 */
const password = "senha-forte-e2e-123";
let seq = 0;
const newEmail = () => `e2e-${Date.now()}-${++seq}-${Math.floor(Math.random() * 1e6)}@example.com`;

async function register(page: Page) {
  await page.goto("/cadastro");
  await page.getByLabel("E-mail").fill(newEmail());
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
}

/** Inglês, 60 min/dia, todos os dias, começando há 3 dias: hoje há pendência de dias anteriores. */
async function onboarding(page: Page) {
  await page.getByRole("button", { name: /Idiomas/ }).click();
  // Idiomas: inglês é o padrão entre mais de 90 idiomas
  await expect(page.getByLabel("Idioma")).toHaveValue("en");
  expect(await page.getByLabel("Idioma").locator("option").count()).toBeGreaterThan(90);
  await page.getByLabel("Nome").fill("Inglês");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Quanto tempo por dia?")).toBeVisible();
  await expect(page.getByText("60 min", { exact: true })).toBeVisible();
  for (const day of ["sábado", "domingo"]) {
    const chip = page.getByRole("button", { name: day, exact: true });
    if ((await chip.getAttribute("aria-pressed")) !== "true") await chip.click();
  }
  const d = new Date();
  d.setDate(d.getDate() - 3);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await page.getByLabel("Começar em").fill(iso);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Concluir" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test("cadastro → objetivo → sessão → saldo → recuperação → material → progresso", async ({ page }) => {
  await register(page);
  await onboarding(page);

  // Tela Hoje: meta base 60 min e 3 dias sem registro = 180 min de pendência anterior
  await expect(page.getByRole("heading", { name: "Hoje" })).toBeVisible();
  await expect(page.getByText("meta base 60 min").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("3h").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Começar sessão" }).filter({ visible: true }).first()).toBeVisible();

  // Registrar 30 min: falta para a meta cai para 30
  await page.getByRole("button", { name: "Registrar manualmente" }).filter({ visible: true }).first().click();
  const sheet = page.getByRole("dialog", { name: "Registrar tempo" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("radio", { name: "30" }).click();
  await sheet.getByRole("button", { name: /Salvar 30 min/ }).click();
  await expect(page.getByText("30 min registrados", { exact: true })).toBeVisible();
  // 30 da meta + recuperação sugerida (180 pendentes distribuídos em 3 dias = 60/dia); dívida não aumenta
  await expect(page.getByText(/Mais 90 min hoje: 30 min da meta \+ 60 min de recuperação/).filter({ visible: true }).first()).toBeVisible();

  // Gamificação: a primeira sessão desbloqueia uma conquista, comemorada uma única vez
  const celebration = page.getByRole("dialog", { name: "Conquista nova!" });
  await expect(celebration).toBeVisible();
  await expect(celebration.getByText("Primeira sessão", { exact: true })).toBeVisible();
  await celebration.getByRole("button", { name: "Fechar" }).last().click();
  await expect(celebration).toBeHidden();
  // conquistas seguintes (material, metas…) também abrem a comemoração: fecha e segue o fluxo
  await page.addLocatorHandler(page.getByRole("dialog", { name: /conquistas? novas?!/i }), async (d) => {
    await d.getByRole("button", { name: "Fechar" }).last().click();
  });

  // Objetivo: matéria e tópico
  await page.goto("/app/objetivos");
  await page.getByRole("link", { name: /Inglês/ }).first().click();
  await expect(page).toHaveURL(/\/app\/objetivos\/[0-9a-f-]+$/);
  const activityUrl = page.url();
  await page.getByRole("button", { name: /Adicionar matéria/ }).first().click();
  const subjectSheet = page.getByRole("dialog", { name: "Nova matéria" });
  await subjectSheet.getByLabel("Nome").fill("Gramática");
  await subjectSheet.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Gramática").first()).toBeVisible();
  await page.getByRole("button", { name: /Adicionar tópico/ }).first().click();
  const topicSheet = page.getByRole("dialog", { name: "Novo tópico" });
  await topicSheet.getByLabel("Nome").fill("Present perfect");
  await topicSheet.getByRole("button", { name: "Adicionar tópico" }).click();
  await expect(page.getByText("Present perfect").first()).toBeVisible();

  // Recuperação: aplica a distribuição sugerida; a pendência não aumenta
  await page.goto(`${activityUrl}/recuperar`);
  await expect(page.getByText("Tempo a recuperar").first()).toBeVisible();
  await page.getByRole("button", { name: "Aplicar replanejamento" }).click();
  await expect(page).not.toHaveURL(/\/recuperar$/, { timeout: 15_000 });
  await page.goto("/app");
  await expect(page.getByText(/de recuperação/).filter({ visible: true }).first()).toBeVisible();

  // Material por link, vinculado ao objetivo e ao tópico com páginas
  await page.goto("/app/materiais");
  await expect(page.getByRole("heading", { name: /Materiais/ })).toBeVisible();
  await page.getByRole("button", { name: "Adicionar material" }).first().click();
  const matSheet = page.getByRole("dialog", { name: "Adicionar material" });
  await matSheet.getByRole("radio", { name: "Link" }).click();
  await matSheet.getByLabel("Nome").fill("Curso de gramática");
  await matSheet.getByLabel("Link").fill("https://example.com/curso");
  await matSheet.getByLabel("Objetivo").selectOption({ label: "Inglês" });
  await matSheet.getByRole("button", { name: "Adicionar" }).click();
  // o material recém-criado abre em seguida; se não abrir, abrimos pela lista
  const matDialog = page.getByRole("dialog", { name: "Curso de gramática" });
  if (!(await matDialog.waitFor({ state: "visible", timeout: 8_000 }).then(() => true, () => false))) {
    await page.getByRole("button", { name: "Abrir Curso de gramática" }).click();
  }
  await matDialog.getByLabel("Vincular a um tópico").selectOption({ label: "Present perfect" });
  await matDialog.getByLabel("Páginas").fill("12–30");
  await matDialog.getByRole("button", { name: "Vincular" }).click();
  await expect(matDialog.getByRole("button", { name: /Desvincular Present perfect/ })).toBeVisible();

  // Progresso
  await page.goto("/app/relatorio");
  await expect(page.getByRole("heading", { name: /Relatório/ }).first()).toBeVisible();
  await expect(page.getByText(/constância/i).filter({ visible: true }).first()).toBeVisible();
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
