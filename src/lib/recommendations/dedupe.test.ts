import { describe, it, expect } from "vitest";
import {
  dedupeRecommendations,
  diversifyByGenre,
} from "@/lib/recommendations/dedupe";
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
    score: 50,
    reasons: [],
    ...overrides,
  };
}

describe("dedupeRecommendations", () => {
  it("collapses different pressings of the same album to the strongest", () => {
    const out = dedupeRecommendations([
      rec({ artist: "Sonic Youth", title: "Goo", score: 30, wantCount: 100 }),
      rec({ artist: "Sonic Youth", title: "Goo", score: 60, wantCount: 50 }),
      rec({ artist: "Sonic Youth", title: "Goo (Reissue)", score: 40, wantCount: 200 }),
      rec({ artist: "Ride", title: "Nowhere", score: 55 }),
    ]);
    expect(out).toHaveLength(2);
    const goo = out.find((r) => r.artist === "Sonic Youth")!;
    // Parenthetical qualifiers are normalized away, so all three are one album;
    // the highest score wins.
    expect(goo.score).toBe(60);
  });

  it("breaks score ties by want count, then by having cover art", () => {
    const out = dedupeRecommendations([
      rec({ artist: "A", title: "X", score: 50, wantCount: 10, coverUrl: "c" }),
      rec({ artist: "A", title: "X", score: 50, wantCount: 99, coverUrl: null }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].wantCount).toBe(99);
  });

  it("keeps distinct albums untouched", () => {
    const input = [
      rec({ artist: "A", title: "One" }),
      rec({ artist: "B", title: "Two" }),
    ];
    expect(dedupeRecommendations(input)).toHaveLength(2);
  });
});

describe("diversifyByGenre", () => {
  it("interleaves genres instead of front-loading the dominant one", () => {
    const input = [
      rec({ genres: ["Rock"], score: 100 }),
      rec({ genres: ["Rock"], score: 90 }),
      rec({ genres: ["Rock"], score: 80 }),
      rec({ genres: ["Jazz"], score: 70 }),
      rec({ genres: ["Soul"], score: 60 }),
    ];
    const out = diversifyByGenre(input);
    // Highest scorer still leads, but the 2nd/3rd slots pull from other genres
    // rather than three Rock picks in a row.
    expect(out[0].genres[0]).toBe("Rock");
    expect(out.slice(0, 3).map((r) => r.genres[0])).toEqual([
      "Rock",
      "Jazz",
      "Soul",
    ]);
    expect(out).toHaveLength(5);
  });

  it("passes a single-genre pool through in score order", () => {
    const input = [
      rec({ genres: ["Rock"], score: 10 }),
      rec({ genres: ["Rock"], score: 30 }),
      rec({ genres: ["Rock"], score: 20 }),
    ];
    expect(diversifyByGenre(input).map((r) => r.score)).toEqual([30, 20, 10]);
  });
});
