import { describe, it, expect } from "vitest";
import {
  normalizeRecommendation,
  normalizeRecommendations,
} from "@/lib/recommendations/normalize";
import type { Recommendation } from "@/lib/types";

function rec(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    discogsReleaseId: 1,
    title: "Title",
    artist: "Artist",
    year: 1990,
    coverUrl: null,
    genres: [],
    formats: [],
    communityRating: null,
    ratingCount: null,
    wantCount: null,
    haveCount: null,
    spotifyAlbumId: null,
    spotifyUrl: null,
    score: 50,
    reasons: [],
    ...overrides,
  };
}

describe("normalizeRecommendation", () => {
  it("passes through an already-well-formed recommendation unchanged", () => {
    const input = rec({ genres: ["Rock"], formats: ["Vinyl"], reasons: ["Because"] });
    expect(normalizeRecommendation(input)).toEqual(input);
  });

  it("coerces missing/non-array genres, formats, and reasons back to arrays", () => {
    const legacy = rec({
      genres: undefined as unknown as string[],
      formats: null as unknown as string[],
      reasons: undefined as unknown as string[],
    });
    const out = normalizeRecommendation(legacy);
    expect(out.genres).toEqual([]);
    expect(out.formats).toEqual([]);
    expect(out.reasons).toEqual([]);
  });

  it("leaves recommendations with no marketplace data untouched", () => {
    const input = rec();
    expect(normalizeRecommendation(input).marketplace).toBeUndefined();
  });

  it("passes through an already-numeric marketplace price", () => {
    const input = rec({
      marketplace: { lowestPrice: 19.99, currency: "USD", numForSale: 3, discogsUrl: "x" },
    });
    expect(normalizeRecommendation(input).marketplace?.lowestPrice).toBe(19.99);
  });

  it("unwraps a legacy { value, currency } object into a plain number", () => {
    const input = rec({
      marketplace: {
        lowestPrice: { value: 12.5, currency: "EUR" } as unknown as number,
        currency: "EUR",
        numForSale: 1,
        discogsUrl: "x",
      },
    });
    const out = normalizeRecommendation(input);
    expect(out.marketplace?.lowestPrice).toBe(12.5);
    expect(out.marketplace?.currency).toBe("USD");
  });

  it("falls back to null for a non-finite or unrecognized price shape", () => {
    const nan = rec({
      marketplace: { lowestPrice: NaN, currency: "USD", numForSale: 0, discogsUrl: "x" },
    });
    expect(normalizeRecommendation(nan).marketplace?.lowestPrice).toBeNull();

    const weird = rec({
      marketplace: {
        lowestPrice: "free" as unknown as number,
        currency: "USD",
        numForSale: 0,
        discogsUrl: "x",
      },
    });
    expect(normalizeRecommendation(weird).marketplace?.lowestPrice).toBeNull();
  });

  it("treats a null price as null rather than throwing", () => {
    const input = rec({
      marketplace: { lowestPrice: null, currency: "GBP", numForSale: 0, discogsUrl: "x" },
    });
    const out = normalizeRecommendation(input);
    expect(out.marketplace?.lowestPrice).toBeNull();
    expect(out.marketplace?.currency).toBe("USD");
  });
});

describe("normalizeRecommendations", () => {
  it("maps normalization across a batch", () => {
    const out = normalizeRecommendations([
      rec({ genres: undefined as unknown as string[] }),
      rec({ discogsReleaseId: 2, formats: undefined as unknown as string[] }),
    ]);
    expect(out.map((r) => r.genres)).toEqual([[], []]);
    expect(out[1].formats).toEqual([]);
  });
});
