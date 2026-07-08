import { describe, it, expect } from "vitest";
import { computeFairValue, applyHistoricalFairValue } from "@/lib/recommendations/fair-value";
import type { Recommendation } from "@/lib/types";

let idCounter = 1;
function rec(overrides: Partial<Recommendation>): Recommendation {
  return {
    discogsReleaseId: idCounter++,
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
    score: 0,
    reasons: [],
    ...overrides,
  };
}

function priced(overrides: Partial<Recommendation>): Recommendation {
  return rec({
    marketplace: { lowestPrice: 20, currency: "USD", numForSale: 1, discogsUrl: "" },
    ...overrides,
  });
}

describe("computeFairValue", () => {
  it("flags a pick with top-quartile demand and bottom-quartile price", () => {
    const goodValue = priced({
      wantCount: 10000,
      haveCount: 100,
      marketplace: { lowestPrice: 5, currency: "USD", numForSale: 3, discogsUrl: "" },
    });
    const batch = [
      goodValue,
      priced({ wantCount: 100, haveCount: 100, marketplace: { lowestPrice: 40, currency: "USD", numForSale: 1, discogsUrl: "" } }),
      priced({ wantCount: 200, haveCount: 100, marketplace: { lowestPrice: 60, currency: "USD", numForSale: 1, discogsUrl: "" } }),
      priced({ wantCount: 50, haveCount: 100, marketplace: { lowestPrice: 80, currency: "USD", numForSale: 1, discogsUrl: "" } }),
    ];
    const flags = computeFairValue(batch);
    expect(flags.get(goodValue.discogsReleaseId)).toBe(true);
  });

  it("does not flag a pick that's cheap but not in demand", () => {
    const cheapButUnwanted = priced({
      wantCount: 5,
      haveCount: 500,
      marketplace: { lowestPrice: 3, currency: "USD", numForSale: 5, discogsUrl: "" },
    });
    const batch = [
      cheapButUnwanted,
      priced({ wantCount: 9000, haveCount: 50, marketplace: { lowestPrice: 90, currency: "USD", numForSale: 1, discogsUrl: "" } }),
      priced({ wantCount: 8000, haveCount: 60, marketplace: { lowestPrice: 100, currency: "USD", numForSale: 1, discogsUrl: "" } }),
      priced({ wantCount: 7000, haveCount: 70, marketplace: { lowestPrice: 110, currency: "USD", numForSale: 1, discogsUrl: "" } }),
    ];
    const flags = computeFairValue(batch);
    expect(flags.get(cheapButUnwanted.discogsReleaseId)).toBe(false);
  });

  it("does not flag a pick that's in demand but expensive", () => {
    const expensiveDemand = priced({
      wantCount: 9000,
      haveCount: 50,
      marketplace: { lowestPrice: 200, currency: "USD", numForSale: 1, discogsUrl: "" },
    });
    const batch = [
      expensiveDemand,
      priced({ wantCount: 100, haveCount: 100, marketplace: { lowestPrice: 10, currency: "USD", numForSale: 1, discogsUrl: "" } }),
      priced({ wantCount: 200, haveCount: 100, marketplace: { lowestPrice: 15, currency: "USD", numForSale: 1, discogsUrl: "" } }),
      priced({ wantCount: 50, haveCount: 100, marketplace: { lowestPrice: 20, currency: "USD", numForSale: 1, discogsUrl: "" } }),
    ];
    const flags = computeFairValue(batch);
    expect(flags.get(expensiveDemand.discogsReleaseId)).toBe(false);
  });

  it("never flags a pick with no known price", () => {
    const unpriced = rec({ wantCount: 100000, haveCount: 1 });
    const batch = [unpriced, priced({ wantCount: 1, haveCount: 1000 })];
    const flags = computeFairValue(batch);
    expect(flags.has(unpriced.discogsReleaseId)).toBe(false);
  });

  it("never flags a pick that's not for sale even if marketplace data exists", () => {
    const notForSale = rec({
      wantCount: 100000,
      haveCount: 1,
      marketplace: { lowestPrice: 5, currency: "USD", numForSale: 0, discogsUrl: "" },
    });
    const batch = [notForSale, priced({ wantCount: 1, haveCount: 1000 })];
    const flags = computeFairValue(batch);
    expect(flags.has(notForSale.discogsReleaseId)).toBe(false);
  });

  it("does not divide by zero or crash on a single-item or all-equal batch", () => {
    const single = [priced({ wantCount: 100, haveCount: 10 })];
    expect(() => computeFairValue(single)).not.toThrow();

    const flat = [
      priced({ wantCount: 100, haveCount: 10 }),
      priced({ wantCount: 100, haveCount: 10 }),
      priced({ wantCount: 100, haveCount: 10 }),
    ];
    const flags = computeFairValue(flat);
    // A flat batch has nothing to be relatively better than — nothing should
    // be flagged as an outlier good deal.
    expect([...flags.values()].every((v) => v === false)).toBe(true);
  });

  it("returns an empty map when no picks have pricing", () => {
    const batch = [rec({}), rec({})];
    expect(computeFairValue(batch).size).toBe(0);
  });
});

describe("applyHistoricalFairValue", () => {
  it("overrides to true when the current price is well below the release's own historical median", () => {
    const item = priced({ marketplace: { lowestPrice: 20, currency: "USD", numForSale: 1, discogsUrl: "" } });
    const batchFlags = new Map([[item.discogsReleaseId, false]]);
    const history = new Map([[item.discogsReleaseId, { count: 5, median: 40 }]]);

    const upgraded = applyHistoricalFairValue([item], batchFlags, history);
    expect(upgraded.get(item.discogsReleaseId)).toBe(true);
  });

  it("overrides to false when the current price isn't meaningfully below its own median", () => {
    const item = priced({ marketplace: { lowestPrice: 38, currency: "USD", numForSale: 1, discogsUrl: "" } });
    const batchFlags = new Map([[item.discogsReleaseId, true]]);
    const history = new Map([[item.discogsReleaseId, { count: 5, median: 40 }]]);

    const upgraded = applyHistoricalFairValue([item], batchFlags, history);
    expect(upgraded.get(item.discogsReleaseId)).toBe(false);
  });

  it("keeps the batch-relative flag when there isn't enough history yet", () => {
    const item = priced({ marketplace: { lowestPrice: 5, currency: "USD", numForSale: 1, discogsUrl: "" } });
    const batchFlags = new Map([[item.discogsReleaseId, true]]);
    // Only 2 snapshots — below the minimum needed to trust a median.
    const history = new Map([[item.discogsReleaseId, { count: 2, median: 10 }]]);

    const upgraded = applyHistoricalFairValue([item], batchFlags, history);
    expect(upgraded.get(item.discogsReleaseId)).toBe(true);
  });

  it("keeps the batch-relative flag for a release with no history at all", () => {
    const item = priced({});
    const batchFlags = new Map([[item.discogsReleaseId, true]]);
    const upgraded = applyHistoricalFairValue([item], batchFlags, new Map());
    expect(upgraded.get(item.discogsReleaseId)).toBe(true);
  });

  it("does not crash or flag a release with history but no current price", () => {
    const item = rec({});
    const batchFlags = new Map<number, boolean>();
    const history = new Map([[item.discogsReleaseId, { count: 5, median: 40 }]]);
    const upgraded = applyHistoricalFairValue([item], batchFlags, history);
    expect(upgraded.has(item.discogsReleaseId)).toBe(false);
  });
});
