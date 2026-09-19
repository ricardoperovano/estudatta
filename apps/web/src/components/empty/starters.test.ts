import { describe, expect, it } from "vitest";
import { readObjectivePrefill, STARTERS, starterHref } from "./starters";

const read = (q: string) => readObjectivePrefill(new URLSearchParams(q));

describe("readObjectivePrefill", () => {
  it("usa os padrões sem parâmetros", () => {
    expect(read("")).toEqual({
      title: "",
      category: "outro_estudo",
      language: "en",
      mode: "time",
      minutes: 60,
      days: [0, 1, 2, 3, 4],
    });
  });

  it("lê nome, categoria, idioma, minutos, dias e modo", () => {
    expect(read("nome=Espanhol&categoria=idioma&idioma=es&minutos=30&dias=6,0,2&modo=mixed")).toEqual({
      title: "Espanhol",
      category: "idioma",
      language: "es",
      mode: "mixed",
      minutes: 30,
      days: [0, 2, 6],
    });
  });

  it("idioma sem nome ganha o nome do idioma", () => {
    expect(read("categoria=idioma&idioma=fr").title).toBe("Francês");
  });

  it("ignora valores inválidos", () => {
    const p = read("categoria=xyz&idioma=zz&minutos=abc&dias=9,-1,x&modo=foo");
    expect(p).toMatchObject({
      category: "outro_estudo",
      language: "en",
      minutes: 60,
      mode: "time",
      days: [0, 1, 2, 3, 4],
    });
    expect(read("minutos=2").minutes).toBe(60);
    expect(read("minutos=9999").minutes).toBe(600);
    expect(read("minutos=33").minutes).toBe(35);
  });

  it("os modelos geram links que o formulário entende", () => {
    for (const s of STARTERS) {
      const p = readObjectivePrefill(new URL(starterHref(s), "https://x").searchParams);
      expect(p.category).toBe(s.params.categoria);
      if (s.params.minutos) expect(p.minutes).toBe(s.params.minutos);
      if (s.params.modo) expect(p.mode).toBe(s.params.modo);
    }
  });
});
