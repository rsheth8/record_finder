import { describe, it, expect } from "vitest";
import { usdToCredits, creditsToUsd, formatCredits, formatUsd } from "@/lib/commerce/pricing";

describe("usdToCredits", () => {
  it("converts at 10 credits per dollar, rounding up", () => {
    expect(usdToCredits(5)).toBe(50);
    expect(usdToCredits(5.01)).toBe(51);
  });

  it("floors at the 50-credit minimum for small or zero amounts", () => {
    expect(usdToCredits(1)).toBe(50);
    expect(usdToCredits(0)).toBe(50);
  });

  it("treats negative or non-finite amounts as the minimum", () => {
    expect(usdToCredits(-10)).toBe(50);
    expect(usdToCredits(NaN)).toBe(50);
  });
});

describe("creditsToUsd", () => {
  it("is the inverse of the credits-per-dollar rate", () => {
    expect(creditsToUsd(100)).toBe(10);
    expect(creditsToUsd(50)).toBe(5);
  });
});

describe("formatCredits", () => {
  it("appends a label with thousands separators", () => {
    expect(formatCredits(1200)).toBe("1,200 credits");
    expect(formatCredits(50)).toBe("50 credits");
  });
});

describe("formatUsd", () => {
  it("formats as a USD currency string", () => {
    expect(formatUsd(19.99)).toBe("$19.99");
    expect(formatUsd(5)).toBe("$5.00");
  });
});
