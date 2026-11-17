import { afterEach, describe, expect, it, vi } from "vitest";

/** Carrega o módulo do zero com a interface no idioma pedido (a lista é montada na carga). */
async function load(locale: "pt-BR" | "en") {
  vi.resetModules();
  vi.doMock("@/i18n", () => ({ locale, t: (s: string) => s }));
  return await import("./languages");
}

afterEach(() => {
  vi.doUnmock("@/i18n");
  vi.resetModules();
});

describe("lista de idiomas", () => {
  it("carrega com a interface em inglês (quebrava na carga do módulo)", async () => {
    const m = await load("en");
    expect(m.OTHER_LANGUAGES.length).toBeGreaterThan(70);
    expect(m.OTHER_LANGUAGES.at(-1)).toBe("und");
    expect(m.languageName("es")).toBe("Spanish");
    expect(m.languageName("bzs")).toBe("Libras (Brazilian Sign Language)");
    expect(m.languageName("und")).toBe("Other language");
  });

  it("carrega em português, em ordem alfabética e com 'Outro idioma' por último", async () => {
    const m = await load("pt-BR");
    expect(m.languageName("es")).toBe("Espanhol");
    const nomes = m.OTHER_LANGUAGES.slice(0, -1).map((c) => m.languageName(c)!);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")));
    expect(m.OTHER_LANGUAGES.at(-1)).toBe("und");
  });

  it("os mais procurados não se repetem na lista geral", async () => {
    const m = await load("en");
    for (const c of m.POPULAR_LANGUAGES) expect(m.OTHER_LANGUAGES).not.toContain(c);
  });
});
