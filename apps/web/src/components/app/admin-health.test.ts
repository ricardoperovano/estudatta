import { describe, expect, it } from "vitest";
import { ago, sourceLabel } from "./admin-health";

const AGORA = Date.parse("2026-11-13T12:00:00Z");

describe("página Saúde", () => {
  it("mostra a recência em minutos, horas e dias", () => {
    expect(ago("2026-11-13T11:59:50Z", AGORA)).toBe("agora");
    expect(ago("2026-11-13T11:55:00Z", AGORA)).toBe("há 5 min");
    expect(ago("2026-11-13T09:00:00Z", AGORA)).toBe("há 3 h");
    expect(ago("2026-11-10T12:00:00Z", AGORA)).toBe("há 3 dias");
    expect(ago("2026-11-13T13:00:00Z", AGORA)).toBe("agora"); // relógio adiantado não vira negativo
  });

  it("nomeia a origem do problema", () => {
    expect(sourceLabel("client")).toBe("App");
    expect(sourceLabel("worker")).toBe("Segundo plano");
    expect(sourceLabel("server")).toBe("Servidor");
  });
});
