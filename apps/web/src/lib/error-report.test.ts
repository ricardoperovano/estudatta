import { describe, expect, it } from "vitest";
import { isChunkError, isNoise } from "./error-report";

describe("relato de erros", () => {
  it("descarta ruído que não é defeito do app", () => {
    expect(isNoise("Script error.")).toBe(true);
    expect(isNoise("ResizeObserver loop limit exceeded")).toBe(true);
    expect(isNoise("TypeError: Failed to fetch")).toBe(true);
    expect(isNoise("AbortError: The user aborted a request.")).toBe(true);
    expect(isNoise("TypeError: x is undefined", "at chrome-extension://abc/content.js:1")).toBe(true);
    expect(isNoise("")).toBe(true);
  });

  it("mantém erros de verdade", () => {
    expect(isNoise("TypeError: Cannot read properties of undefined (reading 'title')")).toBe(false);
    expect(isNoise("RangeError: Invalid time value", "at Hoje (page.tsx:42)")).toBe(false);
  });

  it("reconhece o pedaço de código que deixou de existir depois de um deploy", () => {
    expect(isChunkError("TypeError: Failed to fetch dynamically imported module: https://app/x.js")).toBe(true);
    expect(isChunkError("Importing a module script failed.")).toBe(true);
    expect(isChunkError("TypeError: Failed to fetch")).toBe(false);
  });
});
