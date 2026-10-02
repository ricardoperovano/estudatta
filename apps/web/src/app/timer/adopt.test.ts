import { describe, expect, it } from "vitest";
import { shouldAdopt, type AdoptInput } from "./adopt";

const base: AdoptInput = {
  hydrated: true,
  hasUser: true,
  hasLocalTimer: false,
  serverActive: { id: "s1", device_id: "este-aparelho" },
  deviceId: "este-aparelho",
  endedHere: new Set<string>(),
};

describe("shouldAdopt", () => {
  it("retoma a sessão que ficou aberta neste aparelho", () => {
    expect(shouldAdopt(base)).toBe(true);
    // sessão sem aparelho registrado (veio da sincronização) também é retomada
    expect(shouldAdopt({ ...base, serverActive: { id: "s1", device_id: null } })).toBe(true);
  });

  it("não adota antes de ler o cronômetro local, sem usuário ou sem sessão no servidor", () => {
    expect(shouldAdopt({ ...base, hydrated: false })).toBe(false);
    expect(shouldAdopt({ ...base, hasUser: false })).toBe(false);
    expect(shouldAdopt({ ...base, serverActive: null })).toBe(false);
  });

  it("não adota quando já há cronômetro neste aparelho", () => {
    expect(shouldAdopt({ ...base, hasLocalTimer: true })).toBe(false);
  });

  it("não adota sessão de outro aparelho (isso é a transferência explícita)", () => {
    expect(shouldAdopt({ ...base, serverActive: { id: "s1", device_id: "outro" } })).toBe(false);
  });

  it("não readota a sessão encerrada aqui, mesmo com o cache ainda mostrando-a ativa", () => {
    // o caso do bug: encerrar deixava o cronômetro voltar e a tela Hoje dizia "Em sessão"
    expect(shouldAdopt({ ...base, endedHere: new Set(["s1"]) })).toBe(false);
    // uma sessão nova (outro id) continua sendo adotada normalmente
    expect(shouldAdopt({ ...base, serverActive: { id: "s2" }, endedHere: new Set(["s1"]) })).toBe(true);
  });
});
