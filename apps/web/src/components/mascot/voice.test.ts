import { describe, expect, it } from "vitest";
import { normalizeSpeech } from "./voice";
import { creditsLine } from "./tata-chat-state";

describe("voz do Tatá", () => {
  it("normaliza e corta o texto no limite da voz", () => {
    expect(normalizeSpeech("  Oi!\n  Eu sou   o Tatá. ")).toBe("Oi! Eu sou o Tatá.");
    expect(normalizeSpeech("")).toBe("");
    const long = normalizeSpeech("a".repeat(700));
    expect(long.length).toBeLessThanOrEqual(600);
    expect(long.endsWith("…")).toBe(true);
  });
  it("escreve a linha de conversas restantes", () => {
    expect(creditsLine(3, 10)).toBe("3 conversas restantes hoje · 10 no mês");
    expect(creditsLine(1, null)).toBe("1 conversa restante hoje");
  });
});
