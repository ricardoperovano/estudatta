import { test, expect, type Page } from "@playwright/test";

/**
 * Cadastro com o teste grátis com cartão. O ambiente de testes não tem cobrança ligada, então a
 * oferta e o checkout são simulados na rede; o resto (conta, sessão, primeiros passos) é a API
 * real. O que se confere aqui é o caminho da pessoa: ver a regra da cobrança por extenso antes
 * de aceitar, ir à página do cartão e voltar sem ficar presa, com a conta no gratuito até o
 * provedor confirmar o cartão.
 */
const password = "senha-forte-e2e-123";
let seq = 0;
const newEmail = () => `e2e-teste-${Date.now()}-${++seq}-${Math.floor(Math.random() * 1e6)}@example.com`;
const OFFER = { days: 7, plan_code: "essencial", plan_name: "Essencial", amount_cents: 990, currency: "BRL" };

async function offerTrial(page: Page) {
  await page.route("**/api/v1/public/plans", async (route) => {
    const res = await route.fetch();
    await route.fulfill({ json: { ...(await res.json()), billing_mode: "test", card_trial: OFFER } });
  });
}

async function fill(page: Page) {
  await page.goto("/cadastro");
  await page.getByLabel("Como quer ser chamado").fill("Rita");
  await page.getByLabel("E-mail").fill(newEmail());
  await page.getByLabel("Senha").fill(password);
}

test("cadastro com teste grátis: regra da cobrança à vista, checkout e volta sem cartão", async ({ page }) => {
  await offerTrial(page);
  const asked: unknown[] = [];
  await page.route("**/api/v1/billing/checkout", async (route) => {
    asked.push(route.request().postDataJSON());
    const origin = new URL(page.url()).origin;
    await route.fulfill({
      status: 201,
      json: {
        // no lugar da página do provedor: a pessoa desiste e volta
        checkout_url: `${origin}/onboarding?retorno=checkout&teste=1&status=cancelado`,
        subscription_id: "11111111-1111-4111-8111-111111111111",
        status: "pending",
      },
    });
  });
  await fill(page);

  // o convite e a regra, antes de qualquer clique
  await expect(page.getByText("Teste os benefícios do Essencial por 7 dias")).toBeVisible();
  const terms = page.getByRole("list", { name: "Como funciona a cobrança" });
  await expect(terms).toContainText("Hoje: R$ 0,00.");
  await expect(terms).toContainText("R$ 9,90 todo mês.");
  await expect(terms).toContainText("até você cancelar");
  await expect(terms).toContainText("nada é cobrado");

  await page.getByRole("button", { name: "Criar conta e cadastrar o cartão" }).click();
  await expect(page.getByText("O cartão não foi cadastrado.")).toBeVisible();
  expect(asked).toEqual([{ plan_code: "essencial", interval: "month", trial: true, return_to: "signup" }]);
  // a conta existe, no gratuito, e os primeiros passos seguem normalmente
  await expect(page.getByRole("heading", { name: "O que você quer acompanhar?" })).toBeVisible();
  await page.getByRole("button", { name: "Fechar" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
});

test("cadastro escolhendo o gratuito não passa pelo cartão", async ({ page }) => {
  await offerTrial(page);
  let checkouts = 0;
  await page.route("**/api/v1/billing/checkout", async (route) => {
    checkouts += 1;
    await route.abort();
  });
  await fill(page);
  await page.getByText("Começar no plano gratuito").click();
  await expect(page.getByRole("list", { name: "Como funciona a cobrança" })).toHaveCount(0);
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { name: "O que você quer acompanhar?" })).toBeVisible();
  expect(checkouts).toBe(0);
});

test("checkout fora do ar no cadastro: conta criada no gratuito, com aviso", async ({ page }) => {
  await offerTrial(page);
  await page.route("**/api/v1/billing/checkout", (route) =>
    route.fulfill({ status: 503, json: { error: { code: "provider_unavailable", message: "fora do ar" } } }),
  );
  await fill(page);
  await page.getByRole("button", { name: "Criar conta e cadastrar o cartão" }).click();
  await expect(page.getByText("Sua conta foi criada no plano gratuito.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "O que você quer acompanhar?" })).toBeVisible();
});
