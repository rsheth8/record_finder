import { describe, it, expect, vi, beforeEach } from "vitest";
import { getEnrichmentForReleases, enrichRecommendations } from "@/lib/recommendations/enrich";
import type { Recommendation } from "@/lib/types";

vi.mock("@/lib/discogs/client", () => ({
  getAccountCurrency: vi.fn().mockResolvedValue("USD"),
  getReleaseEnrichment: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  getCachedReleaseEnrichments: vi.fn(),
  cacheReleaseEnrichment: vi.fn().mockResolvedValue(undefined),
}));

import { getAccountCurrency, getReleaseEnrichment } from "@/lib/discogs/client";
import { getCachedReleaseEnrichments, cacheReleaseEnrichment } from "@/lib/db/queries";

function rec(overrides: Partial<Recommendation>): Recommendation {
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

const enrichmentFixture = {
  communityRating: 4.5,
  ratingCount: 10,
  wantCount: 100,
  haveCount: 50,
  marketplace: { lowestPrice: 20, currency: "USD", numForSale: 2, discogsUrl: "x" },
};

describe("getEnrichmentForReleases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty map without touching the DB or Discogs for an empty input", async () => {
    const result = await getEnrichmentForReleases([], "USD");
    expect(result.size).toBe(0);
    expect(getCachedReleaseEnrichments).not.toHaveBeenCalled();
    expect(getReleaseEnrichment).not.toHaveBeenCalled();
  });

  it("uses the DB cache and never calls Discogs for a fully cached batch", async () => {
    vi.mocked(getCachedReleaseEnrichments).mockResolvedValue(
      new Map([[1, enrichmentFixture]]),
    );

    const result = await getEnrichmentForReleases([1], "USD");

    expect(result.get(1)).toEqual(enrichmentFixture);
    expect(getReleaseEnrichment).not.toHaveBeenCalled();
  });

  it("falls through to Discogs for a DB miss and writes the result back to the DB cache", async () => {
    vi.mocked(getCachedReleaseEnrichments).mockResolvedValue(new Map());
    vi.mocked(getReleaseEnrichment).mockResolvedValue(enrichmentFixture);

    const result = await getEnrichmentForReleases([2], "USD");

    expect(result.get(2)).toEqual(enrichmentFixture);
    expect(getReleaseEnrichment).toHaveBeenCalledWith(2, "USD");
    expect(cacheReleaseEnrichment).toHaveBeenCalledWith(
      2,
      "USD",
      enrichmentFixture,
      expect.any(Number),
    );
  });

  it("omits a release from the result when Discogs enrichment fails, and doesn't cache it", async () => {
    vi.mocked(getCachedReleaseEnrichments).mockResolvedValue(new Map());
    vi.mocked(getReleaseEnrichment).mockResolvedValue(null);

    const result = await getEnrichmentForReleases([3], "USD");

    expect(result.has(3)).toBe(false);
    expect(cacheReleaseEnrichment).not.toHaveBeenCalled();
  });

  it("mixes DB hits and Discogs misses correctly within one batch", async () => {
    vi.mocked(getCachedReleaseEnrichments).mockResolvedValue(
      new Map([[1, enrichmentFixture]]),
    );
    const missFixture = { ...enrichmentFixture, wantCount: 999 };
    vi.mocked(getReleaseEnrichment).mockResolvedValue(missFixture);

    const result = await getEnrichmentForReleases([1, 2], "USD");

    expect(result.get(1)).toEqual(enrichmentFixture);
    expect(result.get(2)).toEqual(missFixture);
    expect(getReleaseEnrichment).toHaveBeenCalledTimes(1);
    expect(getReleaseEnrichment).toHaveBeenCalledWith(2, "USD");
  });
});

describe("enrichRecommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty array without calling getAccountCurrency for an empty input", async () => {
    const result = await enrichRecommendations([]);
    expect(result).toEqual([]);
    expect(getAccountCurrency).not.toHaveBeenCalled();
  });

  it("merges enrichment data into matching recs and preserves the original order", async () => {
    vi.mocked(getCachedReleaseEnrichments).mockResolvedValue(
      new Map([[2, enrichmentFixture]]),
    );
    vi.mocked(getReleaseEnrichment).mockResolvedValue(null);

    const input = [rec({ discogsReleaseId: 1 }), rec({ discogsReleaseId: 2 })];
    const result = await enrichRecommendations(input);

    expect(result.map((r) => r.discogsReleaseId)).toEqual([1, 2]);
    expect(result[0].communityRating).toBeNull();
    expect(result[1].communityRating).toBe(4.5);
    expect(result[1].marketplace).toEqual(enrichmentFixture.marketplace);
  });

  it("leaves a rec untouched when no enrichment is available for it", async () => {
    vi.mocked(getCachedReleaseEnrichments).mockResolvedValue(new Map());
    vi.mocked(getReleaseEnrichment).mockResolvedValue(null);

    const input = [rec({ discogsReleaseId: 5, communityRating: 3.2 })];
    const result = await enrichRecommendations(input);

    expect(result[0]).toEqual(input[0]);
  });
});
