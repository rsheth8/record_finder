import { describe, it, expect } from "vitest";
import { groupRecommendations } from "@/lib/recommendations/group";
import type { QuizDecade, QuizGenre, Recommendation } from "@/lib/types";

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

  it("groups remaining items by decade after genre rows are carved out", () => {
    const input = [
      ...Array.from({ length: 12 }, (_, i) => rec({ score: 200 - i, genres: ["Indie"] })),
      ...Array.from({ length: 4 }, (_, i) => rec({ score: 50 - i, genres: [], year: 1975 })),
    ];
    const rows = groupRecommendations(input, [], ["1970s"] satisfies QuizDecade[]);
    const decadeRow = rows.find((r) => r.id === "decade-1970s");
    expect(decadeRow?.items).toHaveLength(4);
  });

  it("does not assign the same recommendation to two rows", () => {
    const input = [
      ...Array.from({ length: 12 }, (_, i) => rec({ score: 200 - i, genres: ["Indie"] })),
      ...Array.from({ length: 4 }, (_, i) =>
        rec({ score: 50 - i, genres: ["Indie"], year: 1975 }),
      ),
    ];
    const rows = groupRecommendations(
      input,
      ["Indie"] satisfies QuizGenre[],
      ["1970s"] satisfies QuizDecade[],
    );
    const seen = new Set<number>();
    for (const row of rows) {
      for (const item of row.items) {
        expect(seen.has(item.discogsReleaseId)).toBe(false);
        seen.add(item.discogsReleaseId);
      }
    }
  });

  it("produces just a top-picks row for a small batch (nothing else clears MIN_ROW_ITEMS)", () => {
    const input = [rec({ genres: ["Obscure"] }), rec({ genres: ["Obscure"] })];
    const rows = groupRecommendations(input);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("top-picks");
    expect(rows[0].items).toHaveLength(2);
  });
});
