import { describe, expect, it } from "vitest";
import { isGhostTimer, type GhostInput } from "./ghost";

const INICIO = "2026-10-01T12:00:00.000Z";
const DEPOIS = Date.parse(INICIO) + 60_000;

const base: GhostInput = {
  timer: { session_id: "s1", synced: true, started_at: INICIO },
  serverActive: null,
  serverAnswered: true,
  answeredAt: DEPOIS,
  online: true,
};

describe("isGhostTimer", () => {
  it("descarta o cronômetro cuja sessão o servidor não tem mais", () => {
    expect(isGhostTimer(base)).toBe(true);
    // encerrada em outro aparelho e já há outra sessão rolando lá
    expect(isGhostTimer({ ...base, serverActive: { id: "s2" } })).toBe(true);
  });

  it("mantém o cronômetro da sessão que o servidor ainda vê aberta", () => {
    expect(isGhostTimer({ ...base, serverActive: { id: "s1" } })).toBe(false);
  });

  it("nunca descarta sessão feita offline, que só existe neste aparelho", () => {
    expect(isGhostTimer({ ...base, timer: { session_id: null, started_at: INICIO } })).toBe(false);
    expect(isGhostTimer({ ...base, timer: { session_id: "s1", synced: false, started_at: INICIO } })).toBe(false);
  });

  it("não descarta sem resposta confiável do servidor", () => {
    expect(isGhostTimer({ ...base, online: false })).toBe(false);
    expect(isGhostTimer({ ...base, serverAnswered: false })).toBe(false);
    expect(isGhostTimer({ ...base, timer: null })).toBe(false);
  });

  it("não descarta com resposta anterior ao início da sessão (cache velho)", () => {
    // começou no celular agora; aqui a resposta é de antes e ainda diz "nenhuma sessão"
    expect(isGhostTimer({ ...base, answeredAt: Date.parse(INICIO) - 1_000 })).toBe(false);
  });
});
