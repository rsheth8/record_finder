import { describe, it, expect } from "vitest";
import { pickRecognizedArtists, RECOGNIZED_ARTISTS } from "@/lib/quiz/recognized-artists";

describe("pickRecognizedArtists", () => {
  it("favors artists from the user's chosen genres first", () => {
    const picks = pickRecognizedArtists(["Jazz"], 3);
    expect(picks).toEqual(RECOGNIZED_ARTISTS.Jazz);
  });

  it("falls back to Rock when no genres are chosen", () => {
    const picks = pickRecognizedArtists([], 3);
    expect(picks).toEqual(RECOGNIZED_ARTISTS.Rock);
  });

  it("tops up from other genres once the chosen ones are exhausted", () => {
    const picks = pickRecognizedArtists(["Jazz"], 6);
    expect(picks.length).toBe(6);
    expect(picks.slice(0, 3)).toEqual(RECOGNIZED_ARTISTS.Jazz);
  });

  it("never exceeds the cap and never duplicates an artist", () => {
    const picks = pickRecognizedArtists(["Rock", "Alternative", "Indie"], 5);
    expect(picks.length).toBeLessThanOrEqual(5);
    expect(new Set(picks).size).toBe(picks.length);
  });
});
