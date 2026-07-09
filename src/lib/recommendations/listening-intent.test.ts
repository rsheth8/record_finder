import { describe, it, expect } from "vitest";
import {
  collectCandidates,
  OBSESSIVE_REPLAY_THRESHOLD,
  ALBUM_WEIGHT_NUDGE_THRESHOLD,
} from "@/lib/recommendations/listening-intent";
import type { StoredSpotifySnapshot } from "@/lib/db/queries";
import type { SpotifyTrack } from "@/lib/types";

function track(overrides: Partial<SpotifyTrack> = {}): SpotifyTrack {
  return {
    id: "t1",
    name: "Track",
    artist: "Artist",
    artistId: "artist-1",
    albumId: "album-1",
    albumName: "Album",
    spotifyUrl: "",
    ...overrides,
  };
}

function snapshot(overrides: Partial<StoredSpotifySnapshot> = {}): StoredSpotifySnapshot {
  return {
    topArtists: { short: [], medium: [], long: [] },
    topTracks: { short: [], medium: [], long: [] },
    savedAlbums: [],
    savedTracks: [],
    recentlyPlayed: [],
    topGenres: [],
    fetchedAt: new Date(),
    tasteVector: null,
    ...overrides,
  };
}

function playedAgo(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

describe("collectCandidates", () => {
  it("counts distinct plays of the same album within the decay window", () => {
    const t = track();
    const snap = snapshot({
      recentlyPlayed: [
        { track: t, playedAt: playedAgo(1) },
        { track: t, playedAt: playedAgo(2) },
        { track: t, playedAt: playedAgo(3) },
      ],
    });
    const candidates = collectCandidates(snap);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].playCount).toBe(OBSESSIVE_REPLAY_THRESHOLD);
  });

  it("excludes plays outside the recency window", () => {
    const t = track();
    const snap = snapshot({
      recentlyPlayed: [
        { track: t, playedAt: playedAgo(1) },
        { track: t, playedAt: playedAgo(2) },
        { track: t, playedAt: playedAgo(10) }, // stale, shouldn't count
      ],
    });
    const candidates = collectCandidates(snap);
    // Only 2 plays within window — below the obsessive-replay threshold and
    // no taste-vector weight, so it shouldn't qualify at all.
    expect(candidates).toHaveLength(0);
  });

  it("does not qualify an album with too few recent plays and no taste weight", () => {
    const t = track();
    const snap = snapshot({
      recentlyPlayed: [
        { track: t, playedAt: playedAgo(1) },
        { track: t, playedAt: playedAgo(2) },
      ],
    });
    expect(collectCandidates(snap)).toHaveLength(0);
  });

  it("qualifies a high taste-vector-weight album even with zero recent plays", () => {
    const snap = snapshot({
      tasteVector: {
        artistWeights: {},
        albumWeights: { "album-1": ALBUM_WEIGHT_NUDGE_THRESHOLD },
        genreWeights: {},
        coreArtistIds: [],
        trendingArtistIds: [],
        derivedAt: new Date().toISOString(),
      },
      savedTracks: [track({ albumId: "album-1", albumName: "Weighted Album" })],
    });
    const candidates = collectCandidates(snap);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].playCount).toBe(0);
    expect(candidates[0].albumName).toBe("Weighted Album");
  });

  it("does not double-count an album that qualifies via both signals", () => {
    const t = track({ albumId: "album-1" });
    const snap = snapshot({
      recentlyPlayed: [
        { track: t, playedAt: playedAgo(1) },
        { track: t, playedAt: playedAgo(2) },
        { track: t, playedAt: playedAgo(3) },
      ],
      tasteVector: {
        artistWeights: {},
        albumWeights: { "album-1": ALBUM_WEIGHT_NUDGE_THRESHOLD },
        genreWeights: {},
        coreArtistIds: [],
        trendingArtistIds: [],
        derivedAt: new Date().toISOString(),
      },
    });
    const candidates = collectCandidates(snap);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].playCount).toBe(OBSESSIVE_REPLAY_THRESHOLD);
  });

  it("skips a weighted album with no name/artist available anywhere", () => {
    const snap = snapshot({
      tasteVector: {
        artistWeights: {},
        albumWeights: { "unknown-album": ALBUM_WEIGHT_NUDGE_THRESHOLD },
        genreWeights: {},
        coreArtistIds: [],
        trendingArtistIds: [],
        derivedAt: new Date().toISOString(),
      },
      // no savedTracks/topTracks entry for "unknown-album"
    });
    expect(collectCandidates(snap)).toHaveLength(0);
  });

  it("returns an empty list for an empty snapshot", () => {
    expect(collectCandidates(snapshot())).toEqual([]);
  });
});
