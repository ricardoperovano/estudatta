import { describe, expect, it } from "vitest";
import { fmtClock, fmtMinutes, fmtMinutesShort, fmtRange } from "./format";

describe("formatação de tempo", () => {
  it("minutos e horas em pt-BR", () => {
    expect(fmtMinutes(40 * 60)).toBe("40 min");
    expect(fmtMinutes(60 * 60)).toBe("1h");
    expect(fmtMinutes(80 * 60)).toBe("1h20");
    expect(fmtMinutes(3 * 3600 + 10 * 60)).toBe("3h10");
    expect(fmtMinutes(0)).toBe("0 min");
  });
  it("valores do dia em minutos até 2h", () => {
    expect(fmtMinutesShort(60 * 60)).toBe("60 min");
    expect(fmtMinutesShort(90 * 60)).toBe("90 min");
    expect(fmtMinutesShort(130 * 60)).toBe("2h10");
  });
  it("cronômetro", () => {
    expect(fmtClock(27 * 60 + 41)).toBe("27:41");
    expect(fmtClock(3600 + 2 * 60 + 3)).toBe("1:02:03");
  });
  it("intervalo", () => {
    expect(fmtRange("2026-09-14", "2026-09-20")).toBe("14 – 20 set");
  });
});
