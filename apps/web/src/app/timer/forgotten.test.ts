import { describe, expect, it } from "vitest";
import { isForgottenTimer } from "./forgotten";

const AGORA = Date.parse("2026-11-16T12:00:00Z");

describe("isForgottenTimer", () => {
  it("considera esquecido o cronômetro aberto há 6 horas ou mais", () => {
    expect(isForgottenTimer("2026-11-16T06:00:00Z", AGORA)).toBe(true);
    expect(isForgottenTimer("2026-11-15T01:39:00Z", AGORA)).toBe(true);
  });

  it("não incomoda uma sessão em curso, mesmo longa", () => {
    expect(isForgottenTimer("2026-11-16T06:00:01Z", AGORA)).toBe(false);
    expect(isForgottenTimer("2026-11-16T08:20:00Z", AGORA)).toBe(false); // 3h40, sessão real
  });

  it("sem data válida, não afirma nada", () => {
    expect(isForgottenTimer(null, AGORA)).toBe(false);
    expect(isForgottenTimer("data inválida", AGORA)).toBe(false);
  });
});
