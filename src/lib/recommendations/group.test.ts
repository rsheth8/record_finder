import { describe, it, expect } from "vitest";
import { groupRecommendations } from "@/lib/recommendations/group";
import type { QuizGenre, Recommendation } from "@/lib/types";

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

describe("groupRecommendations", () => {
  it("returns nothing for an empty batch", () => {
    expect(groupRecommendations([])).toEqual([]);
  });

  it("puts the 12 highest-scored picks in a top-picks row", () => {
    const input = Array.from({ length: 15 }, (_, i) =>
      rec({ score: 100 - i, genres: ["Rock"] }),
    );
    const rows = groupRecommendations(input);
    const top = rows.find((r) => r.id === "top-picks")!;
    expect(top.items).toHaveLength(12);
    expect(top.items[0].score).toBe(100);
  });

  it("does not duplicate a genre row when the quiz label and the raw Discogs "
    + "genre differ only in punctuation (e.g. quiz 'Hip-Hop' vs Discogs 'Hip Hop')", () => {
    const input = [
      ...Array.from({ length: 12 }, (_, i) => rec({ score: 200 - i, genres: ["Indie"] })),
      ...Array.from({ length: 5 }, (_, i) => rec({ score: 90 - i, genres: ["Hip Hop"] })),
    ];
    const rows = groupRecommendations(input, ["Hip-Hop"] satisfies QuizGenre[]);
    const hipHopRows = rows.filter((r) =>
      r.title.toLowerCase().replace(/[^a-z]/g, "") === "hiphop",
    );
    expect(hipHopRows).toHaveLength(1);
    expect(hipHopRows[0].items).toHaveLength(5);
  });

  it("lets a top-picks item also appear in its genre row instead of starving it", () => {
    // With only ~16 total recs, a strict "each rec belongs to exactly one
    // row" rule starved the genre row down to nothing once top-picks claimed
    // the 12 highest scorers — the real bug this test guards against. Rows
    // are highlight reels over a shared pool, not exclusive claims on it.
    const input = [
      ...Array.from({ length: 12 }, (_, i) => rec({ score: 200 - i, genres: ["Indie"] })),
      ...Array.from({ length: 4 }, (_, i) => rec({ score: 50 - i, genres: ["Indie"] })),
    ];
    const rows = groupRecommendations(input, ["Indie"] satisfies QuizGenre[]);
    const topPicks = rows.find((r) => r.id === "top-picks")!;
    const genreRow = rows.find((r) => r.id === "genre-Indie")!;

    expect(genreRow.items).toHaveLength(12);
    const overlap = topPicks.items.filter((r) =>
      genreRow.items.some((g) => g.discogsReleaseId === r.discogsReleaseId),
    );
    expect(overlap.length).toBeGreaterThan(0);
  });

  it("caps scored genre rows at two, beyond quiz genres present in the batch", () => {
    const input = [
      ...Array.from({ length: 4 }, (_, i) => rec({ score: 100 - i, genres: ["Rock"] })),
      ...Array.from({ length: 4 }, (_, i) => rec({ score: 90 - i, genres: ["Jazz"] })),
      ...Array.from({ length: 4 }, (_, i) => rec({ score: 80 - i, genres: ["Funk"] })),
    ];
    const rows = groupRecommendations(
      input,
      ["Rock", "Jazz", "Funk"] satisfies QuizGenre[],
    );
    const genreRows = rows.filter((r) => r.id.startsWith("genre-"));
    expect(genreRows).toHaveLength(2);
  });

  it("adds a deep-cuts row when enough low-want/low-rating items exist", () => {
    const input = [
      ...Array.from({ length: 12 }, (_, i) => rec({ score: 200 - i, genres: ["Indie"] })),
      ...Array.from({ length: 4 }, (_, i) =>
        rec({ score: 50 - i, genres: ["Indie"], wantCount: 10 }),
      ),
    ];
    const rows = groupRecommendations(input, ["Indie"] satisfies QuizGenre[]);
    const deepCuts = rows.find((r) => r.id === "deep-cuts");
    expect(deepCuts?.items).toHaveLength(4);
  });

  it("produces just a top-picks row for a small batch (nothing else clears MIN_ROW_ITEMS)", () => {
    const input = [rec({ genres: ["Obscure"] }), rec({ genres: ["Obscure"] })];
    const rows = groupRecommendations(input);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("top-picks");
    expect(rows[0].items).toHaveLength(2);
  });
});
