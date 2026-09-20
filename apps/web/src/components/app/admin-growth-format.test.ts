import { describe, expect, it } from "vitest";
import {
  COUPON_CODE_RE,
  couponSummary,
  defaultCtaUrl,
  endOfDayIso,
  renderPreview,
  subscriptionStatusLabel,
  TEMPLATES,
} from "./admin-growth-format";

describe("subscriptionStatusLabel", () => {
  it("traduz as situações", () => {
    expect(subscriptionStatusLabel("active")).toBe("Ativa");
    expect(subscriptionStatusLabel("past_due")).toBe("Em atraso");
    expect(subscriptionStatusLabel("expired")).toBe("Encerrada");
    expect(subscriptionStatusLabel("weird")).toBe("weird");
  });
  it("mostra até quando vai o acesso de uma cancelada dentro do período", () => {
    const now = Date.UTC(2026, 8, 20, 12);
    expect(subscriptionStatusLabel("cancelled", "2026-10-01T12:00:00Z", now)).toBe(
      "Cancelada (acesso até 1 out)",
    );
    expect(subscriptionStatusLabel("cancelled", "2026-09-01T12:00:00Z", now)).toBe("Cancelada");
    expect(subscriptionStatusLabel("cancelled", null, now)).toBe("Cancelada");
  });
});

describe("cupons", () => {
  it("valida o código como o servidor", () => {
    expect(COUPON_CODE_RE.test("VOLTA20")).toBe(true);
    expect(COUPON_CODE_RE.test("A-B_1")).toBe(true);
    expect(COUPON_CODE_RE.test("ab")).toBe(false);
    expect(COUPON_CODE_RE.test("volta20")).toBe(false);
    expect(COUPON_CODE_RE.test("-ABC")).toBe(false);
  });
  it("resume o benefício", () => {
    expect(couponSummary({ kind: "percent", value: 20, plan_code: null })).toBe("20% de desconto");
    expect(couponSummary({ kind: "percent", value: 20, plan_code: "pro" })).toBe("20% de desconto no pro");
    expect(couponSummary({ kind: "trial", value: 7, plan_code: "pro" })).toBe("7 dias grátis do pro");
  });
  it("converte a data para o fim do dia local", () => {
    const iso = endOfDayIso("2026-12-31");
    expect(iso).not.toBeNull();
    const d = new Date(iso!);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11);
    expect(d.getDate()).toBe(31);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
    expect(endOfDayIso("")).toBeNull();
    expect(endOfDayIso("31/12/2026")).toBeNull();
  });
});

describe("campanhas", () => {
  it("substitui os marcadores", () => {
    expect(renderPreview("Oi, {nome}! Use {cupom} e {cupom}.", "Ana", "VOLTA20")).toBe(
      "Oi, Ana! Use VOLTA20 e VOLTA20.",
    );
    expect(renderPreview("Sem cupom: {cupom}.", "Ana", "")).toBe("Sem cupom: .");
  });
  it("monta a URL padrão do botão", () => {
    expect(defaultCtaUrl("https://x.test", "")).toBe("https://x.test/app");
    expect(defaultCtaUrl("https://x.test", "VOLTA20")).toBe("https://x.test/app/planos?cupom=VOLTA20");
  });
  it("modelos usam {nome} e só citam o cupom quando há um", () => {
    for (const t of TEMPLATES) expect(t.body(true)).toContain("{nome}");
    const comeback = TEMPLATES.find((t) => t.key === "comeback")!;
    expect(comeback.body(false)).not.toContain("{cupom}");
    expect(comeback.body(true)).toContain("{cupom}");
    expect(TEMPLATES.find((t) => t.key === "discount")!.body(false)).toContain("{cupom}");
  });
});
