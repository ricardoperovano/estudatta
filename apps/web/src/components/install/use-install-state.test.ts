import { describe, expect, it } from "vitest";
import { isDismissed } from "./use-install-state";

const DAY = 24 * 60 * 60 * 1000;

describe("isDismissed", () => {
  const now = Date.UTC(2026, 8, 19);
  it("vale por 14 dias depois do 'agora não'", () => {
    expect(isDismissed(null, now)).toBe(false);
    expect(isDismissed(now, now)).toBe(true);
    expect(isDismissed(now - 13 * DAY, now)).toBe(true);
    expect(isDismissed(now - 14 * DAY, now)).toBe(false);
  });
  it("ignora datas absurdas no futuro", () => {
    expect(isDismissed(now + 1000, now)).toBe(true);
    expect(isDismissed(now + 30 * DAY, now)).toBe(false);
  });
});
