import { describe, it, expect } from "vitest";
import { buildBrowseRowQueue } from "@/lib/recommendations/browse-rows";
import { QUIZ_DECADES, QUIZ_GENRES } from "@/lib/types";

describe("buildBrowseRowQueue", () => {
  it("queues quiz genres first, then quiz decades", () => {
    const rows = buildBrowseRowQueue(["Jazz", "Rock"], ["1990s"]);
    expect(rows[0]).toMatchObject({ genre: "Jazz" });
    expect(rows[1]).toMatchObject({ genre: "Rock" });
    expect(rows[2]).toMatchObject({ decade: "1990s" });
  });

  it("skips a quiz genre already claimed by a scored row", () => {
    const rows = buildBrowseRowQueue(["Rock", "Jazz"], [], ["Rock"]);
    expect(rows.some((r) => r.genre === "Rock")).toBe(false);
    expect(rows.some((r) => r.genre === "Jazz")).toBe(true);
  });

  it("never duplicates a genre or decade row", () => {
    const rows = buildBrowseRowQueue(["Rock"], ["1990s"]);
    const genreIds = rows.filter((r) => r.genre).map((r) => r.genre);
    const decadeIds = rows.filter((r) => r.decade).map((r) => r.decade);
    expect(new Set(genreIds).size).toBe(genreIds.length);
    expect(new Set(decadeIds).size).toBe(decadeIds.length);
  });

  it("falls through to the full genre and decade taxonomy after quiz answers", () => {
    const rows = buildBrowseRowQueue(["Rock"], ["1990s"]);
    for (const genre of QUIZ_GENRES) {
      expect(rows.some((r) => r.genre === genre)).toBe(true);
    }
    for (const decade of QUIZ_DECADES) {
      expect(rows.some((r) => r.decade === decade)).toBe(true);
    }
  });

  it("ends with evergreen most-wanted and new-arrivals rows", () => {
    const rows = buildBrowseRowQueue([], []);
    const last2 = rows.slice(-2);
    expect(last2.map((r) => r.id)).toEqual(["browse-most-wanted", "browse-new-arrivals"]);
  });

  it("produces a large enough queue to scroll through", () => {
    const rows = buildBrowseRowQueue(["Rock", "Jazz"], ["1990s", "2000s"]);
    expect(rows.length).toBeGreaterThan(20);
  });
});
