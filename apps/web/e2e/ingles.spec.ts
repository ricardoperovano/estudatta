import { test, expect, type Page } from "@playwright/test";

/**
 * App em inglês, do cadastro à tela Hoje. Existe porque o caminho em inglês quebrou sem ninguém
 * ver: `src/lib/languages.ts` ordenava a lista de idiomas na carga do módulo usando uma
 * constante declarada mais abaixo, o que só estoura com a interface em inglês. Toda conta nova
 * com o navegador em inglês caía em "Something went wrong" na configuração inicial.
 */
test.use({ locale: "en-US" });

const password = "senha-forte-e2e-123";
const newEmail = () => `e2e-en-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

/** Falha o teste se a página lançar exceção ou cair na tela de erro. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function skipTours(page: Page) {
  await page.addLocatorHandler(page.locator("[data-tour-card]"), async (card) => {
    await card.getByRole("button", { name: /Skip tour|Close$/ }).first().click();
  });
}

async function expectHealthy(page: Page, errors: string[]) {
  await expect(page.getByText("Something went wrong.")).toHaveCount(0);
  expect(errors, `exceções na página: ${errors.join(" | ")}`).toEqual([]);
}

test("sign up in English → onboarding → Today, and the screens that list languages", async ({ page }) => {
  const errors = watchErrors(page);
  await skipTours(page);

  await page.goto("/cadastro");
  await page.getByLabel("Email").fill(newEmail());
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  // a configuração inicial precisa abrir: era aqui que a tela de erro aparecia
  await expect(page.getByRole("heading", { name: "What do you want to track?" })).toBeVisible();
  await expectHealthy(page, errors);

  await page.getByRole("button", { name: /Languages/ }).click();
  const language = page.getByLabel("Language");
  await expect(language).toHaveValue("en");
  expect(await language.locator("option").count()).toBeGreaterThan(90);
  // nomes em inglês, em ordem alfabética depois dos mais procurados
  await expect(language.locator("option", { hasText: "Spanish" })).toHaveCount(1);
  await page.getByLabel("Name").fill("English");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("How much time per day?")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expectHealthy(page, errors);

  // as outras telas que carregam a lista de idiomas
  await page.goto("/app/objetivos/novo");
  await expect(page.getByRole("heading", { name: "What do you want to track?" })).toBeVisible();
  await expectHealthy(page, errors);

  await page.goto("/app/objetivos");
  await page.getByRole("link", { name: /English/ }).first().click();
  await page.getByRole("tab", { name: "Settings" }).click();
  await expect(page.getByLabel("Language").first()).toBeVisible();
  await expectHealthy(page, errors);
});
