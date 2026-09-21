import { describe, expect, it } from "vitest";
import { appendSuggestion, defaultStudyType, fmtBookmark, validatePagesRead } from "./session-progress";

describe("session-progress", () => {
  it("sugere o tipo de estudo pela categoria", () => {
    expect(defaultStudyType("leitura")).toBe("leitura");
    expect(defaultStudyType("pratica")).toBe("pratica");
    expect(defaultStudyType("faculdade")).toBe("aula");
    expect(defaultStudyType("concurso")).toBe("teoria");
    expect(defaultStudyType(undefined)).toBe("teoria");
  });

  it("acrescenta sugestões sem repetir", () => {
    expect(appendSuggestion("", "Vocabulário")).toBe("Vocabulário");
    expect(appendSuggestion("Vocabulário", "Gramática")).toBe("Vocabulário · Gramática");
    expect(appendSuggestion("Vocabulário · Gramática", "Gramática")).toBe("Vocabulário · Gramática");
  });

  it("formata o marcador", () => {
    expect(fmtBookmark(null)).toBeNull();
    expect(
      fmtBookmark({
        id: "1",
        title: "Dom Casmurro",
        kind: "physical",
        current_page: 42,
        pages_total: 200,
        last_position: null,
        percent: 21,
      }),
    ).toBe("Dom Casmurro · p. 42 de 200");
    expect(
      fmtBookmark({
        id: "1",
        title: "Livro",
        kind: "physical",
        current_page: null,
        pages_total: null,
        last_position: null,
        percent: null,
      }),
    ).toBe("Livro · ainda sem marcador");
  });

  it("valida páginas lidas", () => {
    expect(validatePagesRead(null)).toBeNull();
    expect(validatePagesRead(8)).toBeNull();
    expect(validatePagesRead(-1)).toMatch(/inteiro/);
    expect(validatePagesRead(5001)).toMatch(/limite/);
  });
});
