import { describe, it, expect, beforeEach, vi } from "vitest";

process.env.DISCOGS_TOKEN = "test-token";

// discogsThrottle is a module-level singleton that spaces real calls 1/sec —
// reset modules and re-import per test so each test's first call gets a fresh
// throttle (no wait), instead of the suite eating real setTimeout delays.
async function freshSearchCatalog() {
  vi.resetModules();
  const mod = await import("@/lib/discogs/client");
  return mod.searchCatalog;
}

// The enrichment/currency caches are also module-level singletons — reset
// modules so each test starts with an empty cache, but (unlike
// freshSearchCatalog) return the whole module so a single test can make
// multiple calls against the *same* fresh cache to assert hit behavior.
async function freshDiscogsClient() {
  vi.resetModules();
  return import("@/lib/discogs/client");
}

function mockFetchOnce(body: unknown) {
  return vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => body,
  } as Response);
}

describe("searchCatalog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("clamps a page below 1 up to 1", async () => {
    const fetchSpy = mockFetchOnce({ results: [], pagination: { page: 1, pages: 1, items: 0, per_page: 10 } });
    const searchCatalog = await freshSearchCatalog();
    await searchCatalog("nirvana", 0);
    expect(fetchSpy.mock.calls[0][0] as string).toContain("page=1");
  });

  it("clamps a page above the max down to the max", async () => {
    const fetchSpy = mockFetchOnce({ results: [], pagination: { page: 50, pages: 1, items: 0, per_page: 10 } });
    const searchCatalog = await freshSearchCatalog();
    await searchCatalog("nirvana", 9999);
    expect(fetchSpy.mock.calls[0][0] as string).toContain("page=50");
  });

  it("routes a genre that's a real Discogs top-level genre through genre=", async () => {
    const fetchSpy = mockFetchOnce({ results: [], pagination: { page: 1, pages: 1, items: 0, per_page: 10 } });
    const searchCatalog = await freshSearchCatalog();
    await searchCatalog("nirvana", 1, { genre: "Rock" });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("genre=Rock");
    expect(url).not.toContain("style=");
  });

  it("routes a genre that's actually a Discogs style through style=", async () => {
    const fetchSpy = mockFetchOnce({ results: [], pagination: { page: 1, pages: 1, items: 0, per_page: 10 } });
    const searchCatalog = await freshSearchCatalog();
    await searchCatalog("nirvana", 1, { genre: "Alternative" });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain(encodeURIComponent("Alternative Rock"));
    expect(url).not.toContain("genre=Alternative");
  });

  it("appends the decade as a keyword token rather than a real filter param", async () => {
    const fetchSpy = mockFetchOnce({ results: [], pagination: { page: 1, pages: 1, items: 0, per_page: 10 } });
    const searchCatalog = await freshSearchCatalog();
    await searchCatalog("nirvana", 1, { decade: "1990s" });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain(encodeURIComponent("nirvana 1990"));
  });

  it("maps each sort option to real Discogs sort/sort_order params", async () => {
    const cases: [import("@/lib/discogs/client").SearchSortOption, string][] = [
      ["most_wanted", "sort=want&sort_order=desc"],
      ["newest", "sort=year&sort_order=desc"],
      ["oldest", "sort=year&sort_order=asc"],
      ["artist_az", "sort=artist&sort_order=asc"],
    ];
    for (const [sort, expected] of cases) {
      const fetchSpy = mockFetchOnce({ results: [], pagination: { page: 1, pages: 1, items: 0, per_page: 10 } });
      const searchCatalog = await freshSearchCatalog();
      await searchCatalog("nirvana", 1, { sort });
      expect(fetchSpy.mock.calls[0][0] as string).toContain(expected);
    }
  });

  it("omits the sort param entirely for relevance (Discogs' own default ranking)", async () => {
    const fetchSpy = mockFetchOnce({ results: [], pagination: { page: 1, pages: 1, items: 0, per_page: 10 } });
    const searchCatalog = await freshSearchCatalog();
    await searchCatalog("nirvana", 1, { sort: "relevance" });
    expect(fetchSpy.mock.calls[0][0] as string).not.toContain("sort=");
  });

  it("falls back to a sane pagination shape when Discogs omits the envelope", async () => {
    mockFetchOnce({ results: [{ id: 1, title: "A - B" }] });
    const searchCatalog = await freshSearchCatalog();
    const { pagination } = await searchCatalog("nirvana", 3);
    expect(pagination).toEqual({ page: 3, pages: 1, items: 1, perPage: 24 });
  });

  it("maps search results into Recommendation shape with empty reasons", async () => {
    mockFetchOnce({
      results: [
        {
          id: 42,
          title: "Nirvana - Nevermind",
          year: "1991",
          cover_image: "https://example.com/x.jpg",
          genre: ["Rock"],
          style: ["Grunge"],
          format: ["Vinyl"],
          community: { want: 100, have: 50 },
        },
      ],
      pagination: { page: 1, pages: 1, items: 1, per_page: 10 },
    });
    const searchCatalog = await freshSearchCatalog();
    const { results } = await searchCatalog("nevermind");
    expect(results).toEqual([
      {
        discogsReleaseId: 42,
        title: "Nevermind",
        artist: "Nirvana",
        year: 1991,
        coverUrl: "https://example.com/x.jpg",
        genres: ["Rock", "Grunge"],
        formats: ["Vinyl"],
        communityRating: null,
        ratingCount: null,
        wantCount: 100,
        haveCount: 50,
        spotifyAlbumId: null,
        spotifyUrl: null,
        score: 0,
        reasons: [],
      },
    ]);
  });

  it("handles a missing results array without throwing", async () => {
    mockFetchOnce({ pagination: { page: 1, pages: 1, items: 0, per_page: 10 } });
    const searchCatalog = await freshSearchCatalog();
    const { results } = await searchCatalog("");
    expect(results).toEqual([]);
  });
});

describe("getAccountCurrency caching", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("only fetches once for repeat calls, even with a different sample release id", async () => {
    const fetchSpy = mockFetchOnce({ lowest_price: { value: 10, currency: "EUR" } });
    const { getAccountCurrency } = await freshDiscogsClient();

    expect(await getAccountCurrency(1)).toBe("EUR");
    expect(await getAccountCurrency(999)).toBe("EUR");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("getReleaseEnrichment caching", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("only fetches once for repeat calls to the same release + currency", async () => {
    const fetchSpy = mockFetchOnce({
      num_for_sale: 3,
      lowest_price: null,
      community: { want: 100, have: 50, rating: { average: 4.5, count: 20 } },
    });
    const { getReleaseEnrichment } = await freshDiscogsClient();

    const first = await getReleaseEnrichment(42, "USD");
    const second = await getReleaseEnrichment(42, "USD");

    expect(first).toEqual(second);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("fetches separately for the same release under a different currency", async () => {
    const fetchSpy = mockFetchOnce({
      num_for_sale: 3,
      lowest_price: null,
      community: { want: 100, have: 50, rating: { average: 4.5, count: 20 } },
    });
    const { getReleaseEnrichment } = await freshDiscogsClient();

    await getReleaseEnrichment(42, "USD");
    await getReleaseEnrichment(42, "EUR");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed fetch, so the next call retries", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ num_for_sale: 0, community: {} }),
      } as Response);
    const { getReleaseEnrichment } = await freshDiscogsClient();

    const first = await getReleaseEnrichment(42, "USD");
    const second = await getReleaseEnrichment(42, "USD");

    expect(first).toBeNull();
    expect(second).not.toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
