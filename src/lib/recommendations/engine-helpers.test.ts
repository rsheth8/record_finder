import { describe, it, expect } from "vitest";
import { mapQuizGenresToSpotify } from "@/lib/recommendations/engine";
import { deriveTopGenres } from "@/lib/spotify/client";
import type { SpotifyArtist } from "@/lib/types";

describe("mapQuizGenresToSpotify", () => {
  it("maps quiz genres to Spotify seed slugs", () => {
    expect(mapQuizGenresToSpotify(["Hip-Hop", "R&B"])).toEqual(["hip-hop", "r-n-b"]);
  });

  it("caps the seed list at 5", () => {
    const out = mapQuizGenresToSpotify([
      "Rock",
      "Jazz",
      "Soul",
      "Funk",
      "Pop",
      "Blues",
    ]);
    expect(out).toHaveLength(5);
  });
});

describe("deriveTopGenres", () => {
  it("ranks genres by frequency across artists", () => {
    const artists: SpotifyArtist[] = [
      { id: "1", name: "A", genres: ["rock", "indie"], popularity: 50 },
      { id: "2", name: "B", genres: ["rock"], popularity: 60 },
      { id: "3", name: "C", genres: ["jazz", "rock"], popularity: 40 },
    ];
    expect(deriveTopGenres(artists)[0]).toBe("rock");
  });

  it("returns an empty list when there are no genres", () => {
    expect(deriveTopGenres([])).toEqual([]);
  });
});
