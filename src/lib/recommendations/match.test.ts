import { describe, it, expect } from "vitest";
import {
  normalize,
  tokenize,
  tokenSimilarity,
  splitDiscogsTitle,
  scoreDiscogsMatch,
  pickBestMatch,
  isFullAlbum,
  type DiscogsSearchResult,
} from "@/lib/recommendations/match";

describe("normalize", () => {
  it("lowercases, strips accents and punctuation", () => {
    expect(normalize("Björk – Post!")).toBe("bjork post");
  });

  it("drops parenthetical and bracketed qualifiers", () => {
    expect(normalize("Rumours (Deluxe Edition) [Remastered]")).toBe("rumours");
  });
});

describe("tokenize", () => {
  it("removes noise words", () => {
    expect(tokenize("The Wall and A Day")).toEqual(["wall", "day"]);
  });
});

describe("tokenSimilarity", () => {
  it("is 1 for identical (order/punctuation-insensitive) strings", () => {
    expect(tokenSimilarity("Wish You Were Here", "wish you were here!")).toBe(1);
  });

  it("is 0 for disjoint strings", () => {
    expect(tokenSimilarity("Kind of Blue", "Rumours")).toBe(0);
  });

  it("ignores edition suffixes when comparing", () => {
    expect(
      tokenSimilarity("Abbey Road", "Abbey Road (2019 Remaster)"),
    ).toBe(1);
  });
});

describe("splitDiscogsTitle", () => {
  it("splits on the first separator", () => {
    expect(splitDiscogsTitle("Pink Floyd - The Wall")).toEqual({
      artist: "Pink Floyd",
      title: "The Wall",
    });
  });

  it("keeps hyphenated titles intact", () => {
    expect(splitDiscogsTitle("Pink Floyd - Wish You Were Here - Live")).toEqual({
      artist: "Pink Floyd",
      title: "Wish You Were Here - Live",
    });
  });

  it("handles titles with no separator", () => {
    expect(splitDiscogsTitle("Unknown Album")).toEqual({
      artist: "Unknown",
      title: "Unknown Album",
    });
  });
});

function result(overrides: Partial<DiscogsSearchResult>): DiscogsSearchResult {
  return { id: 1, title: "Artist - Title", ...overrides };
}

describe("scoreDiscogsMatch", () => {
  it("returns 0 when the artist does not overlap (avoids cross-matches)", () => {
    const r = result({ title: "Adele - 21" });
    expect(scoreDiscogsMatch("Radiohead", "21", r)).toBe(0);
  });

  it("scores a clean artist+title match highly", () => {
    const r = result({ title: "Radiohead - OK Computer" });
    expect(scoreDiscogsMatch("Radiohead", "OK Computer", r)).toBeGreaterThan(0.9);
  });

  it("penalizes singles relative to LPs", () => {
    const lp = result({ title: "Radiohead - Creep", format: ["Vinyl", "LP"] });
    const single = result({ title: "Radiohead - Creep", format: ["Vinyl", "Single", '7"'] });
    expect(scoreDiscogsMatch("Radiohead", "Creep", lp)).toBeGreaterThan(
      scoreDiscogsMatch("Radiohead", "Creep", single),
    );
  });
});

describe("pickBestMatch", () => {
  it("skips a mismatched first result in favor of the real match", () => {
    const results: DiscogsSearchResult[] = [
      result({ id: 10, title: "Various - Rock Ballads" }),
      result({ id: 11, title: "Fleetwood Mac - Rumours", format: ["Vinyl", "LP"] }),
    ];
    const best = pickBestMatch("Fleetwood Mac", "Rumours", results);
    expect(best?.id).toBe(11);
  });

  it("returns null when nothing clears the confidence bar", () => {
    const results: DiscogsSearchResult[] = [
      result({ id: 10, title: "Various - Rock Ballads" }),
      result({ id: 11, title: "Some Guy - Other Record" }),
    ];
    expect(pickBestMatch("Fleetwood Mac", "Rumours", results)).toBeNull();
  });

  it("returns null for an empty result set", () => {
    expect(pickBestMatch("Anyone", "Anything", [])).toBeNull();
  });
});

describe("isFullAlbum", () => {
  it("is true for LP/Album formats", () => {
    expect(isFullAlbum(["Vinyl", "LP", "Album"])).toBe(true);
  });

  it("is false for singles and EPs", () => {
    expect(isFullAlbum(["Vinyl", '7"', "Single"])).toBe(false);
    expect(isFullAlbum(["Vinyl", "EP"])).toBe(false);
  });

  it("is false when the format is unknown", () => {
    expect(isFullAlbum(["Vinyl"])).toBe(false);
  });
});
