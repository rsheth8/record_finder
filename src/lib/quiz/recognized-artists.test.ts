import { describe, it, expect } from "vitest";
import {
  pickRecognizedArtists,
  RECOGNIZED_ARTISTS,
  RECOGNIZED_ARTISTS_BEGINNER,
} from "@/lib/quiz/recognized-artists";

describe("pickRecognizedArtists", () => {
  it("favors artists from the user's chosen genres first", () => {
    const picks = pickRecognizedArtists(["Jazz"], "casual", 3);
    expect(picks).toEqual(RECOGNIZED_ARTISTS.Jazz);
  });

  it("falls back to Rock when no genres are chosen", () => {
    const picks = pickRecognizedArtists([], "casual", 3);
    expect(picks).toEqual(RECOGNIZED_ARTISTS.Rock);
  });

  it("tops up from other genres once the chosen ones are exhausted", () => {
    const picks = pickRecognizedArtists(["Jazz"], "casual", 6);
    expect(picks.length).toBe(6);
    expect(picks.slice(0, 3)).toEqual(RECOGNIZED_ARTISTS.Jazz);
  });

  it("never exceeds the cap and never duplicates an artist", () => {
    const picks = pickRecognizedArtists(["Rock", "Alternative", "Indie"], "casual", 5);
    expect(picks.length).toBeLessThanOrEqual(5);
    expect(new Set(picks).size).toBe(picks.length);
  });

  it("draws from the beginner tier when experienceLevel is 'new'", () => {
    const picks = pickRecognizedArtists(["Jazz"], "new", 2);
    expect(picks).toEqual(RECOGNIZED_ARTISTS_BEGINNER.Jazz);
  });

  it("defaults to the casual/collector tier when experienceLevel is omitted", () => {
    const picks = pickRecognizedArtists(["Jazz"], undefined, 3);
    expect(picks).toEqual(RECOGNIZED_ARTISTS.Jazz);
  });
});
