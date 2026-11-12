import { describe, expect, it } from "vitest";
import { trialDaysLeft } from "./trial-banner";

const AGORA = Date.parse("2026-11-12T12:00:00Z");

describe("trialDaysLeft", () => {
  it("conta o dia em curso", () => {
    expect(trialDaysLeft("2026-11-26T12:00:00Z", AGORA)).toBe(14);
    expect(trialDaysLeft("2026-11-13T11:00:00Z", AGORA)).toBe(1);
    expect(trialDaysLeft("2026-11-12T12:30:00Z", AGORA)).toBe(1);
  });

  it("é zero quando o teste acabou ou não há data", () => {
    expect(trialDaysLeft("2026-11-12T11:59:00Z", AGORA)).toBe(0);
    expect(trialDaysLeft(null, AGORA)).toBe(0);
    expect(trialDaysLeft("data inválida", AGORA)).toBe(0);
  });
});
