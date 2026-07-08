import { describe, it, expect } from "vitest";
import { roundUsd, convertToUsd } from "@/lib/commerce/currency";

describe("roundUsd", () => {
  it("rounds to two decimal places", () => {
    expect(roundUsd(19.995)).toBe(20);
    expect(roundUsd(11.111)).toBe(11.11);
    expect(roundUsd(11.116)).toBe(11.12);
  });
});

describe("convertToUsd", () => {
  it("returns the amount unchanged when already USD", async () => {
    expect(await convertToUsd(25, "USD")).toBe(25);
    expect(await convertToUsd(25, "usd")).toBe(25);
  });

  it("returns 0 for a non-finite amount", async () => {
    expect(await convertToUsd(NaN, "USD")).toBe(0);
    expect(await convertToUsd(Infinity, "EUR")).toBe(0);
  });

  it("returns the amount unchanged when currency is blank", async () => {
    expect(await convertToUsd(10, "")).toBe(10);
  });

  it("falls back to the raw amount when the FX fetch fails", async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    try {
      expect(await convertToUsd(10, "EUR")).toBe(10);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("converts using the fetched rate", async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      json: async () => ({ rates: { EUR: 0.5 } }),
    })) as unknown as typeof fetch;
    try {
      expect(await convertToUsd(10, "EUR")).toBe(20);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
