import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import type { CardTrialOffer } from "@/api/billing";

const subscription = vi.hoisted(() => ({ current: null as unknown }));
const plansState = vi.hoisted(() => ({ current: { isPending: false, data: undefined as unknown } }));
const checkout = vi.hoisted(() => ({ fn: (() => Promise.resolve({})) as (body: unknown) => Promise<unknown> }));
vi.mock("@/api/billing", () => ({
  useSubscription: () => ({ data: { subscription: subscription.current }, refetch: vi.fn() }),
  usePublicPlans: () => plansState.current,
  useCheckout: () => ({ mutateAsync: (body: unknown) => checkout.fn(body) }),
}));

import {
  CardTrialOpening,
  CardTrialPitch,
  CardTrialReturn,
  CardTrialTerms,
  fmtChargeDay,
  isTrialPending,
  markTrialPending,
  trialChargeDate,
} from "./card-trial";

const offer: CardTrialOffer = {
  days: 7,
  plan_code: "essencial",
  plan_name: "Essencial",
  amount_cents: 990,
  currency: "BRL",
};

function text(): string {
  return (document.body.textContent ?? "").split(String.fromCharCode(160)).join(" "); // espaço do "R$ 9,90"
}

function renderReturn(url: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <CardTrialReturn />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("trialChargeDate", () => {
  it("soma os dias de teste ao dia de hoje, virando o mês", () => {
    const d = trialChargeDate(7, new Date(2026, 10, 27, 22, 30));
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 11, 4]);
  });
});

describe("CardTrialTerms", () => {
  it("diz quanto sai hoje, quando e quanto é cobrado, e que repete todo mês até cancelar", () => {
    render(<CardTrialTerms offer={offer} chargeAt={new Date(2026, 10, 24)} />);
    const day = fmtChargeDay(new Date(2026, 10, 24));
    const t = text();
    expect(t).toContain("Hoje: R$ 0,00.");
    expect(t).toContain("Nada é cobrado.");
    expect(t).toContain(`Em ${day}: R$ 9,90.`);
    expect(t).toContain("se você não tiver cancelado antes");
    expect(t).toContain("Depois: R$ 9,90 todo mês.");
    expect(t).toContain("até você cancelar");
    expect(t).toContain(`Cancelando antes de ${day}, nada é cobrado.`);
  });
});

describe("CardTrialPitch", () => {
  it("convida a testar os benefícios do plano, com os primeiros itens do catálogo", () => {
    const plan = {
      code: "essencial",
      name: "Essencial",
      description: null,
      features: ["Até 3 objetivos ativos", "IA para organizar", "Voz natural", "Lembretes", "Relatórios"],
      limits: {},
      recommended: true,
      prices: [],
    };
    render(<CardTrialPitch offer={offer} plan={plan} max={3} />);
    expect(screen.getByText("Teste os benefícios do Essencial por 7 dias")).toBeInTheDocument();
    expect(screen.getByText("Até 3 objetivos ativos")).toBeInTheDocument();
    expect(screen.queryByText("Lembretes")).not.toBeInTheDocument();
  });
});

describe("CardTrialReturn", () => {
  it("não aparece fora da volta do checkout", () => {
    subscription.current = null;
    const { container } = renderReturn("/app/planos");
    expect(container).toBeEmptyDOMElement();
  });

  it("checkout abandonado: nada cobrado, conta no gratuito", () => {
    subscription.current = null;
    renderReturn("/onboarding?retorno=checkout&teste=1&status=cancelado");
    expect(text()).toContain("O cartão não foi cadastrado.");
    expect(text()).toContain("nada foi cobrado");
  });

  it("enquanto o provedor não confirma, não diz que o teste começou", () => {
    subscription.current = { status: "pending", plan_name: "Essencial" };
    renderReturn("/onboarding?retorno=checkout&teste=1&status=sucesso");
    expect(text()).toContain("Confirmando seu cartão.");
    expect(text()).not.toContain("liberado.");
  });

  it("teste confirmado: repete a regra da cobrança", () => {
    subscription.current = {
      status: "trialing",
      plan_name: "Essencial",
      amount_cents: 990,
      current_period_end: "2026-11-25T02:59:59Z",
    };
    renderReturn("/app/planos?retorno=checkout&teste=1&status=sucesso");
    expect(text()).toContain("Teste do Essencial liberado.");
    expect(text()).toContain("cobramos R$ 9,90 no cartão");
    expect(text()).toContain("todo mês, até você cancelar");
  });

  it("checkout que não abriu no cadastro", () => {
    subscription.current = null;
    renderReturn("/onboarding?teste=falhou");
    expect(text()).toContain("Sua conta foi criada no plano gratuito.");
  });
});

function Where() {
  const loc = useLocation();
  return <output data-testid="url">{loc.pathname + loc.search}</output>;
}

const settled = vi.fn();

function renderOpening() {
  settled.mockClear();
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/onboarding"]}>
        <CardTrialOpening onSettled={settled} />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CardTrialOpening", () => {
  it("pede o checkout do teste mensal, voltando para os primeiros passos", async () => {
    plansState.current = { isPending: false, data: { card_trial: offer, plans: [] } };
    const asked: unknown[] = [];
    checkout.fn = (body) => {
      asked.push(body);
      return Promise.resolve({ checkout_url: "" }); // sem link: não sai da página no teste
    };
    renderOpening();
    await waitFor(() => expect(screen.getByTestId("url").textContent).toBe("/onboarding?teste=falhou"));
    expect(asked).toEqual([{ plan_code: "essencial", interval: "month", trial: true, return_to: "signup" }]);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("sem oferta, segue no gratuito com aviso e esquece a escolha", async () => {
    plansState.current = { isPending: false, data: { card_trial: null, plans: [] } };
    markTrialPending(true);
    expect(isTrialPending()).toBe(true);
    renderOpening();
    await waitFor(() => expect(screen.getByTestId("url").textContent).toBe("/onboarding?teste=falhou"));
  });

  it("a escolha do cadastro vale uma vez só", () => {
    expect(isTrialPending()).toBe(false);
  });

  it("com o provedor fora do ar, segue no gratuito com aviso", async () => {
    plansState.current = { isPending: false, data: { card_trial: offer, plans: [] } };
    checkout.fn = () => Promise.reject(new Error("fora do ar"));
    renderOpening();
    await waitFor(() => expect(screen.getByTestId("url").textContent).toBe("/onboarding?teste=falhou"));
  });
});
