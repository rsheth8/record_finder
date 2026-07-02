import { auth } from "@/lib/auth";
import {
  getSpotifySnapshot,
  getCachedRecommendations,
  cacheRecommendations,
  clearRecommendationCache,
  saveSpotifySnapshot,
  getUserFeedback,
} from "@/lib/db/queries";
import { getTasteProfile } from "@/lib/taste-profile-store";
import {
  fetchDiscoveryAlbums,
  fetchTopArtists,
  deriveTopGenres,
} from "@/lib/spotify/client";
import {
  scoreCandidates,
  getQuizOnlyRecommendations,
  mapQuizGenresToSpotify,
  collectSimilarArtistNames,
} from "@/lib/recommendations/engine";
import { toSourceError, type SourceError } from "@/lib/errors";
import { enrichRecommendations } from "@/lib/recommendations/enrich";
import type { Recommendation } from "@/lib/types";

/** How long a cached Spotify listening snapshot stays fresh before we refetch. */
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

export async function loadRecommendations(
  userId: string,
  refresh = false,
): Promise<{
  recommendations: Recommendation[];
  error?: string;
  degraded: SourceError[];
}> {
  const profile = await getTasteProfile(userId);
  if (!profile?.completedAt) {
    return {
      recommendations: [],
      error: "Complete the taste quiz first",
      degraded: [],
    };
  }

  if (!refresh) {
    const cached = await getCachedRecommendations(userId);
    if (cached && cached.length > 0) {
      const needsEnrichment = cached.some((r) => !r.marketplace);
      if (needsEnrichment) {
        const enriched = await enrichRecommendations(cached);
        await cacheRecommendations(userId, enriched);
        return { recommendations: enriched, degraded: [] };
      }
      return { recommendations: cached, degraded: [] };
    }
  } else {
    await clearRecommendationCache(userId);
  }

  const degraded: SourceError[] = [];

  try {
    const session = await auth();
    const snapshot = await getSpotifySnapshot(userId);
    const feedback = await getUserFeedback(userId);
    const excludedIds = new Set(
      feedback
        .filter((f) => f.signal === "hide" || f.signal === "own")
        .map((f) => f.discogsReleaseId),
    );
    let recommendations: Recommendation[];

    if (session?.error === "RefreshAccessTokenError") {
      degraded.push(
        toSourceError(
          "spotify",
          "Your Spotify connection expired — reconnect to use listening history in recommendations.",
        ),
      );
    }

    if (session?.accessToken && session.error !== "RefreshAccessTokenError") {
      let topArtists = snapshot?.topArtists ?? [];
      let topGenres = snapshot?.topGenres ?? [];

      try {
        // Refresh listening history when missing or stale, so recommendations
        // don't freeze on a snapshot taken months ago.
        const snapshotStale =
          !snapshot ||
          snapshot.topArtists.length === 0 ||
          Date.now() - snapshot.fetchedAt.getTime() > SNAPSHOT_TTL_MS;

        if (snapshotStale) {
          topArtists = await fetchTopArtists(session.accessToken);
          topGenres = deriveTopGenres(topArtists);
          await saveSpotifySnapshot(userId, {
            topArtists,
            topAlbums: snapshot?.topAlbums ?? [],
            topGenres,
          });
        }

        // Computed once and shared: seeds new-to-you discovery candidates and
        // powers the similar-artist scoring bonus (avoids duplicate Last.fm hits).
        const similarArtistNames = await collectSimilarArtistNames(topArtists);

        const candidates = await fetchDiscoveryAlbums(
          session.accessToken,
          {
            artists: topArtists.slice(0, 3),
            genres: mapQuizGenresToSpotify(profile.genres),
            similarArtists: similarArtistNames,
          },
          30,
        );

        if (candidates.length > 0) {
          recommendations = await scoreCandidates(
            candidates,
            profile,
            topArtists,
            topGenres,
            similarArtistNames,
            feedback,
          );
        } else {
          degraded.push(
            toSourceError(
              "spotify",
              "No Spotify-based candidates found — showing quiz-based picks instead.",
            ),
          );
          recommendations = await getQuizOnlyRecommendations(profile);
        }
      } catch (error) {
        degraded.push(toSourceError("spotify", error));
        recommendations = await getQuizOnlyRecommendations(profile);
      }
    } else {
      recommendations = await getQuizOnlyRecommendations(profile);
    }

    // Drop anything the user marked as owned or hidden (covers both the
    // Spotify-scored and quiz-only paths).
    if (excludedIds.size > 0) {
      recommendations = recommendations.filter(
        (r) => !excludedIds.has(r.discogsReleaseId),
      );
    }

    if (recommendations.length > 0) {
      recommendations = await enrichRecommendations(recommendations);
      await cacheRecommendations(userId, recommendations);
    } else {
      degraded.push(
        toSourceError(
          "discogs",
          "No vinyl matches were found on Discogs for your taste profile.",
        ),
      );
    }

    return { recommendations, degraded };
  } catch (error) {
    return {
      recommendations: [],
      error:
        error instanceof Error
          ? error.message
          : "Failed to generate recommendations",
      degraded: [...degraded, toSourceError("discogs", error, false)],
    };
  }
}
