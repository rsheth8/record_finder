import { describe, it, expect } from "vitest";
import {
  filterRecommendations,
  sortRecommendations,
  getAvailableGenres,
  hasActiveFilters,
  DEFAULT_DISCOVER_FILTERS,
  type DiscoverFilterState,
} from "@/lib/recommendations/filter";
import type { Recommendation } from "@/lib/types";

function rec(overrides: Partial<Recommendation>): Recommendation {
  return {
    discogsReleaseId: Math.floor(Math.random() * 1e6),
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

function filters(overrides: Partial<DiscoverFilterState>): DiscoverFilterState {
  return { ...DEFAULT_DISCOVER_FILTERS, ...overrides };
}

describe("filterRecommendations", () => {
  const items = [
    rec({ title: "Kind of Blue", artist: "Miles Davis", genres: ["Jazz"], year: 1959, communityRating: 4.8, ratingCount: 100 }),
    rec({ title: "Nevermind", artist: "Nirvana", genres: ["Rock", "Grunge"], year: 1991, communityRating: 4.2, ratingCount: 50 }),
    rec({ title: "Discovery", artist: "Daft Punk", genres: ["Electronic"], year: 2001, communityRating: null, ratingCount: null }),
  ];

  it("matches search across title, artist, and genres", () => {
    expect(filterRecommendations(items, filters({ search: "nirvana" }))).toHaveLength(1);
    expect(filterRecommendations(items, filters({ search: "jazz" }))).toHaveLength(1);
  });

  it("filters by genre with loose substring matching", () => {
    const out = filterRecommendations(items, filters({ genres: ["Rock"] }));
    expect(out.map((r) => r.artist)).toEqual(["Nirvana"]);
  });

  it("filters by decade", () => {
    const out = filterRecommendations(items, filters({ decades: ["1990s"] }));
    expect(out.map((r) => r.artist)).toEqual(["Nirvana"]);
  });

  it("filters by minimum rating and drops unrated items", () => {
    const out = filterRecommendations(items, filters({ minRating: 4.5 }));
    expect(out.map((r) => r.artist)).toEqual(["Miles Davis"]);
  });
});

describe("sortRecommendations", () => {
  const items = [
    rec({ artist: "B", year: 1980, communityRating: 3, score: 10 }),
    rec({ artist: "A", year: 2010, communityRating: 5, score: 30 }),
    rec({ artist: "C", year: 1995, communityRating: 4, score: 20 }),
  ];

  it("best_match sorts by score desc", () => {
    expect(sortRecommendations(items, "best_match").map((r) => r.score)).toEqual([30, 20, 10]);
  });

  it("newest sorts by year desc", () => {
    expect(sortRecommendations(items, "newest").map((r) => r.year)).toEqual([2010, 1995, 1980]);
  });

  it("oldest sorts by year asc", () => {
    expect(sortRecommendations(items, "oldest").map((r) => r.year)).toEqual([1980, 1995, 2010]);
  });

  it("highest_rated sorts by community rating desc", () => {
    expect(sortRecommendations(items, "highest_rated").map((r) => r.communityRating)).toEqual([5, 4, 3]);
  });

  it("artist_az sorts alphabetically", () => {
    expect(sortRecommendations(items, "artist_az").map((r) => r.artist)).toEqual(["A", "B", "C"]);
  });

  it("does not mutate the input array", () => {
    const before = items.map((r) => r.artist);
    sortRecommendations(items, "artist_az");
    expect(items.map((r) => r.artist)).toEqual(before);
  });
});

describe("getAvailableGenres", () => {
  it("returns genres ordered by frequency then name", () => {
    const items = [
      rec({ genres: ["Rock", "Jazz"] }),
      rec({ genres: ["Rock"] }),
      rec({ genres: ["Jazz"] }),
      rec({ genres: ["Ambient"] }),
    ];
    expect(getAvailableGenres(items)).toEqual(["Jazz", "Rock", "Ambient"]);
  });
});

describe("hasActiveFilters", () => {
  it("is false for defaults", () => {
    expect(hasActiveFilters(DEFAULT_DISCOVER_FILTERS)).toBe(false);
  });

  it("is true when any filter is set", () => {
    expect(hasActiveFilters(filters({ search: "x" }))).toBe(true);
    expect(hasActiveFilters(filters({ sort: "newest" }))).toBe(true);
    expect(hasActiveFilters(filters({ deepCutOnly: true }))).toBe(true);
  });
});
