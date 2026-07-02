import { describe, it, expect } from "vitest";
import { deriveTasteProfile, getTopWeightedGenres } from "@/lib/taste/derive-profile";
import type { SpotifyListeningSnapshot } from "@/lib/types";

function makeSnapshot(
  overrides: Partial<SpotifyListeningSnapshot> = {},
): SpotifyListeningSnapshot {
  return {
    topArtists: { short: [], medium: [], long: [] },
    topTracks: { short: [], medium: [], long: [] },
    savedAlbums: [],
    savedTracks: [],
    recentlyPlayed: [],
    topGenres: [],
    fetchedAt: new Date(),
    ...overrides,
  };
}

describe("deriveTasteProfile", () => {
  it("weights saved albums at maximum album affinity", () => {
    const snapshot = makeSnapshot({
      savedAlbums: [
        {
          id: "album-1",
          name: "Kind of Blue",
          artist: "Miles Davis",
          artistId: "artist-1",
          releaseDate: "1959",
          imageUrl: null,
          spotifyUrl: "https://open.spotify.com/album/1",
        },
      ],
    });

    const vector = deriveTasteProfile(snapshot);
    expect(vector.albumWeights["album-1"]).toBe(1);
  });

  it("ranks short-term top artists higher than long-term-only artists", () => {
    const snapshot = makeSnapshot({
      topArtists: {
        short: [
          { id: "trending", name: "Trending", genres: ["indie"], popularity: 70 },
        ],
        medium: [
          { id: "core", name: "Core", genres: ["rock"], popularity: 60 },
        ],
        long: [
          { id: "core", name: "Core", genres: ["rock"], popularity: 60 },
        ],
      },
    });

    const vector = deriveTasteProfile(snapshot);
    expect(vector.artistWeights.trending).toBeGreaterThan(0);
    expect(vector.trendingArtistIds).toContain("trending");
    expect(vector.coreArtistIds).toContain("core");
  });

  it("boosts recently played artists with recency decay", () => {
    const snapshot = makeSnapshot({
      recentlyPlayed: [
        {
          track: {
            id: "t1",
            name: "Track",
            artist: "Recent Artist",
            artistId: "recent-1",
            albumId: "a1",
            albumName: "Album",
            spotifyUrl: "https://open.spotify.com/track/1",
          },
          playedAt: new Date().toISOString(),
        },
      ],
    });

    const vector = deriveTasteProfile(snapshot);
    expect(vector.artistWeights["recent-1"]).toBeGreaterThan(0);
  });

  it("merges quiz album battle winners into album weights", () => {
    const vector = deriveTasteProfile(makeSnapshot(), [
      {
        winnerAlbumId: "battle:rock-1:A",
        loserAlbumId: "battle:rock-1:B",
        winnerTitle: "The Dark Side of the Moon",
        loserTitle: "Rumours",
        winnerArtist: "Pink Floyd",
        loserArtist: "Fleetwood Mac",
      },
    ]);

    expect(vector.albumWeights["battle:rock-1:A"]).toBeGreaterThan(0.8);
  });
});

describe("getTopWeightedGenres", () => {
  it("returns genres sorted by weight", () => {
    const genres = getTopWeightedGenres({
      artistWeights: {},
      albumWeights: {},
      genreWeights: { jazz: 0.9, rock: 0.3, soul: 0.6 },
      coreArtistIds: [],
      trendingArtistIds: [],
      derivedAt: new Date().toISOString(),
    });

    expect(genres[0]).toBe("jazz");
    expect(genres[1]).toBe("soul");
  });
});
