import { describe, it, expect } from "vitest";
import { GENRE_DISCOGS_PARAM } from "@/lib/discogs/genre-map";
import { QUIZ_GENRES } from "@/lib/types";

describe("GENRE_DISCOGS_PARAM", () => {
  it("has an entry for every quiz genre", () => {
    for (const genre of QUIZ_GENRES) {
      expect(GENRE_DISCOGS_PARAM[genre]).toBeDefined();
      expect(GENRE_DISCOGS_PARAM[genre].value.length).toBeGreaterThan(0);
    }
  });

  it("routes genres that aren't real Discogs top-level genres to style instead", () => {
    // These were verified live to return 0 results as genre= — they only
    // exist in Discogs' style taxonomy.
    expect(GENRE_DISCOGS_PARAM.Alternative.field).toBe("style");
    expect(GENRE_DISCOGS_PARAM.Indie.field).toBe("style");
    expect(GENRE_DISCOGS_PARAM.Punk.field).toBe("style");
    expect(GENRE_DISCOGS_PARAM.Metal.field).toBe("style");
    expect(GENRE_DISCOGS_PARAM["R&B"].field).toBe("style");
  });

  it("routes genres that are real Discogs top-level genres to genre", () => {
    expect(GENRE_DISCOGS_PARAM.Rock.field).toBe("genre");
    expect(GENRE_DISCOGS_PARAM.Jazz.field).toBe("genre");
    expect(GENRE_DISCOGS_PARAM["Hip-Hop"].field).toBe("genre");
  });
});
