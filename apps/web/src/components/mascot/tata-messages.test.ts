import { describe, expect, it } from "vitest";
import { TATA_SITUATIONS, TATA_TONES, greetingSituation, tataSay } from "./tata-messages";

describe("falas do Tatá", () => {
  it("tem falas para toda situação e tom, sem culpa", () => {
    for (const s of TATA_SITUATIONS)
      for (const t of TATA_TONES) {
        const text = tataSay(s, t, 0, { min: "25 min" });
        expect(text.length).toBeGreaterThan(1);
        expect(text).not.toMatch(/\{|\}|preguiç|vergonha|fracass|culpa sua/i);
      }
  });
  it("percorre as opções e substitui variáveis", () => {
    expect(tataSay("timer_milestone", "direto", 0, { min: "50 min" })).toBe("50 min de foco.");
    expect(tataSay("poke", "acolhedor", 1)).not.toBe(tataSay("poke", "acolhedor", 0));
    expect(tataSay("poke", "acolhedor", -1)).toBeTruthy();
  });
  it("saúda pelo horário", () => {
    expect(greetingSituation(8)).toBe("today_morning");
    expect(greetingSituation(14)).toBe("today_afternoon");
    expect(greetingSituation(21)).toBe("today_evening");
  });
});
