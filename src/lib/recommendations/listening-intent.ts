import type { Recommendation, WishlistItem } from "@/lib/types";
import type { StoredSpotifySnapshot } from "@/lib/db/queries";
import { searchVinylRelease } from "@/lib/discogs/client";
import { mapWithConcurrency } from "@/lib/utils/rate-limited-pool";

/** Matches `RECENCY_DECAY_DAYS` used elsewhere in the recommendation engine
 * (engine.ts, derive-profile.ts) — the same "still hot" window. */
const RECENCY_DECAY_DAYS = 7;

/** Distinct play events within `RECENCY_DECAY_DAYS` that reads as "obsessive
 * replay" rather than just casual listening. */
export const OBSESSIVE_REPLAY_THRESHOLD = 3;

/** Reuses the same cutoff `buildReasons` already uses for "related to your top
 * artist" (engine.ts) — an album this core to your recent taste vector, even
 * without hitting the raw replay-count threshold, still qualifies. */
export const ALBUM_WEIGHT_NUDGE_THRESHOLD = 0.7;

export interface ListeningIntentNudge {
  /** A validated real vinyl pressing, with `reasons` overwritten to explain
   * the nudge specifically (see below) rather than generic taste-match text. */
  vinyl: Recommendation;
  playCount: number;
}

interface NudgeCandidate {
  albumId: string;
  albumName: string;
  artist: string;
  playCount: number;
}

/** Buckets recent plays by album, counting distinct play events within the
 * decay window, and folds in any album that clears the taste-vector weight
 * threshold even if it wasn't played this week (a core favorite doesn't need
 * to have been replayed *recently* to still be worth nudging on). Exported for
 * direct unit testing — the network-calling part of this module isn't. */
export function collectCandidates(
  snapshot: StoredSpotifySnapshot,
): NudgeCandidate[] {
  const now = Date.now();
  const byAlbum = new Map<string, NudgeCandidate>();

  for (const { track, playedAt } of snapshot.recentlyPlayed ?? []) {
    const daysAgo = (now - new Date(playedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysAgo > RECENCY_DECAY_DAYS) continue;

    const existing = byAlbum.get(track.albumId);
    if (existing) {
      existing.playCount += 1;
    } else {
      byAlbum.set(track.albumId, {
        albumId: track.albumId,
        albumName: track.albumName,
        artist: track.artist,
        playCount: 1,
      });
    }
  }

  const albumWeights = snapshot.tasteVector?.albumWeights ?? {};
  for (const [albumId, weight] of Object.entries(albumWeights)) {
    if (weight < ALBUM_WEIGHT_NUDGE_THRESHOLD) continue;
    if (byAlbum.has(albumId)) continue; // already qualifies via play count
    // A high-weight album not in recentlyPlayed still needs a name/artist —
    // look it up from savedTracks/topTracks so we have something to search.
    const fromSaved = (snapshot.savedTracks ?? []).find(
      (t) => t.albumId === albumId,
    );
    const fromTop =
      fromSaved ??
      [
        ...(snapshot.topTracks?.short ?? []),
        ...(snapshot.topTracks?.medium ?? []),
        ...(snapshot.topTracks?.long ?? []),
      ].find((t) => t.albumId === albumId);
    if (!fromTop) continue;
    byAlbum.set(albumId, {
      albumId,
      albumName: fromTop.albumName,
      artist: fromTop.artist,
      playCount: 0,
    });
  }

  return [...byAlbum.values()].filter(
    (c) => c.playCount >= OBSESSIVE_REPLAY_THRESHOLD || (albumWeights[c.albumId] ?? 0) >= ALBUM_WEIGHT_NUDGE_THRESHOLD,
  );
}

/** Surfaces albums the user has been obsessively replaying (or that are
 * otherwise core to their recent taste vector) that aren't already wishlisted
 * or in their current recommendation feed, each validated against a real
 * Discogs vinyl pressing. This is the "you've been playing this a lot, get it
 * on vinyl" signal — no competitor has both the listening data and the vinyl
 * marketplace to make this connection. */
export async function getListeningIntentNudges(
  snapshot: StoredSpotifySnapshot | null,
  wishlist: WishlistItem[],
  excludeReleaseIds: Set<number>,
  limit = 5,
): Promise<ListeningIntentNudge[]> {
  if (!snapshot) return [];

  const wishlistReleaseIds = new Set(wishlist.map((w) => w.discogsReleaseId));

  const candidates = collectCandidates(snapshot)
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, limit);

  const resolved = await mapWithConcurrency(candidates, 3, async (candidate) => {
    const vinyl = await searchVinylRelease(candidate.artist, candidate.albumName).catch(
      () => null,
    );
    if (!vinyl) return null;
    if (wishlistReleaseIds.has(vinyl.discogsReleaseId)) return null;
    if (excludeReleaseIds.has(vinyl.discogsReleaseId)) return null;

    return {
      playCount: candidate.playCount,
      vinyl: {
        ...vinyl,
        reasons:
          candidate.playCount > 0
            ? [
                `You've played this ${candidate.playCount} time${
                  candidate.playCount === 1 ? "" : "s"
                } this week`,
              ]
            : ["A core favorite in your recent listening"],
      },
    };
  });

  return resolved.filter((n): n is ListeningIntentNudge => n !== null);
}
