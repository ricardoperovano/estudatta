import { describe, expect, it } from "vitest";
import { normalizeSpeech, pickVoice } from "./voice";
import { creditsLine } from "./tata-chat-state";

describe("voz do Tatá", () => {
  it("prefere pt-BR, depois qualquer português, senão a padrão do aparelho", () => {
    const voices = [
      { lang: "en-US", name: "Samantha", default: true },
      { lang: "pt-PT", name: "Joana" },
      { lang: "pt-BR", name: "Luciana" },
      { lang: "pt_BR", name: "Francisca", default: true },
    ];
    expect(pickVoice(voices)?.name).toBe("Francisca");
    expect(pickVoice(voices.filter((v) => v.name !== "Francisca"))?.name).toBe("Luciana");
    expect(pickVoice(voices.filter((v) => !v.lang.toLowerCase().includes("br")))?.name).toBe("Joana");
    expect(pickVoice([{ lang: "en-US" }, { lang: "es-ES" }])).toBeNull();
    expect(pickVoice([])).toBeNull();
  });
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
