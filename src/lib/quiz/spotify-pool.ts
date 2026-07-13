import type { SpotifyAlbum, SpotifyArtist, SpotifyTrack, SpotifyTopByTerm } from "@/lib/types";

export interface SpotifyQuizPool {
  topArtists: string[];
  topAlbums: { artist: string; title: string }[];
}

/** Builds the recognized-artists/album-battle option pool from a user's own
 * Spotify listening data, so those two quiz steps are guaranteed relevant
 * instead of drawing from the generic curated pool. Used both server-side
 * (an already-connected user landing on /quiz) and client-side (right after
 * a mid-quiz OAuth reconnect, parsed from the sync API's JSON response) —
 * both inputs structurally match this shape. */
export function buildSpotifyQuizPool(snapshot: {
  topArtists: SpotifyTopByTerm<SpotifyArtist>;
  savedAlbums: SpotifyAlbum[];
  topTracks: SpotifyTopByTerm<SpotifyTrack>;
}): SpotifyQuizPool {
  const topArtists = (snapshot.topArtists?.medium ?? [])
    .map((a) => a.name)
    .filter(Boolean);

  // savedAlbums requires an explicit Spotify library save, which many
  // connected users won't have — fall back to deduped albums implied by top
  // tracks so the pool isn't empty for a merely-active listener.
  const seenAlbumIds = new Set<string>();
  const topAlbums: { artist: string; title: string }[] = [];
  for (const album of snapshot.savedAlbums ?? []) {
    if (topAlbums.length >= 6) break;
    topAlbums.push({ artist: album.artist, title: album.name });
  }
  for (const track of snapshot.topTracks?.medium ?? []) {
    if (topAlbums.length >= 6) break;
    if (!track.albumId || seenAlbumIds.has(track.albumId)) continue;
    seenAlbumIds.add(track.albumId);
    topAlbums.push({ artist: track.artist, title: track.albumName });
  }

  return { topArtists, topAlbums };
}
