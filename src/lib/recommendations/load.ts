import { auth } from "@/lib/auth";
import {
  getSpotifySnapshot,
  getCachedRecommendations,
  cacheRecommendations,
  clearRecommendationCache,
  getUserFeedback,
  getWishlist,
  getQuizResponses,
  getPriceHistoryStatsForReleases,
  logEvent,
} from "@/lib/db/queries";
import { getTasteProfile } from "@/lib/taste-profile-store";
import { fetchDiscoveryAlbums } from "@/lib/spotify/client";
import { syncSpotifyListening } from "@/lib/spotify/sync";
import {
  scoreCandidates,
  getQuizOnlyRecommendations,
  mapQuizGenresToSpotify,
  collectSimilarArtistsWithMatch,
  hasSpotifyReason,
} from "@/lib/recommendations/engine";
import {
  artistsFromIds,
  getTopWeightedGenres,
} from "@/lib/taste/derive-profile";
import { toSourceError, type SourceError } from "@/lib/errors";
import { enrichRecommendations } from "@/lib/recommendations/enrich";
import {
  dedupeRecommendations,
  diversifyByGenre,
} from "@/lib/recommendations/dedupe";
import { finalizeScores } from "@/lib/recommendations/finalize";
import {
  computeFairValue,
  applyHistoricalFairValue,
  FAIR_VALUE_HISTORY_LOOKBACK_DAYS,
} from "@/lib/recommendations/fair-value";
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
    let snapshot = await getSpotifySnapshot(userId);
    const feedback = await getUserFeedback(userId);
    const wishlist = await getWishlist(userId);
    const quizResponses = await getQuizResponses(userId);
    const excludedIds = new Set(
      feedback
        .filter((f) => f.signal === "hide" || f.signal === "own")
        .map((f) => f.discogsReleaseId),
    );
    let recommendations: Recommendation[];
    let source: "spotify" | "quiz-only" = "quiz-only";

    if (session?.error === "RefreshAccessTokenError") {
      degraded.push(
        toSourceError(
          "spotify",
          "Your Spotify connection expired — reconnect to use listening history in recommendations.",
        ),
      );
    }

    if (session?.accessToken && session.error !== "RefreshAccessTokenError") {
      const topArtists = snapshot?.topArtists.medium ?? [];
      let topGenres = snapshot?.topGenres ?? [];

      try {
        const snapshotStale =
          !snapshot ||
          topArtists.length === 0 ||
          Date.now() - snapshot.fetchedAt.getTime() > SNAPSHOT_TTL_MS;

        if (snapshotStale) {
          const syncStart = Date.now();
          const synced = await syncSpotifyListening(userId, session.accessToken);
          snapshot = {
            ...synced,
            tasteVector: synced.tasteVector,
          };
          topGenres = synced.topGenres;
          await logEvent(userId, "spotify_sync_completed", {
            durationMs: Date.now() - syncStart,
            artistCount: synced.topArtists.medium.length,
          });
        }

        const tasteVector = snapshot?.tasteVector ?? null;
        const allArtists = [
          ...(snapshot?.topArtists.short ?? []),
          ...(snapshot?.topArtists.medium ?? []),
          ...(snapshot?.topArtists.long ?? []),
        ];

        const similarArtists = await collectSimilarArtistsWithMatch(
          snapshot?.topArtists.medium ?? [],
        );

        const tasteGenres = tasteVector
          ? getTopWeightedGenres(tasteVector, 5)
          : [];
        const quizGenres = mapQuizGenresToSpotify(profile.genres);
        const seedGenres = tasteGenres.length > 0 ? tasteGenres : quizGenres;

        const savedAlbumArtists = artistsFromIds(
          [...new Set((snapshot?.savedAlbums ?? []).map((a) => a.artistId))],
          allArtists,
        );
        const trendingArtists = artistsFromIds(
          tasteVector?.trendingArtistIds ?? [],
          allArtists,
        );
        const coreArtists = artistsFromIds(
          tasteVector?.coreArtistIds ?? [],
          allArtists,
        );

        const candidates = await fetchDiscoveryAlbums(
          session.accessToken,
          {
            artists: snapshot?.topArtists.medium.slice(0, 3) ?? [],
            genres: seedGenres,
            similarArtists: similarArtists.map((a) => a.name),
            savedAlbumArtists,
            trendingArtists,
            coreArtists,
          },
          40,
        );

        if (candidates.length > 0) {
          source = "spotify";
          recommendations = await scoreCandidates(
            candidates,
            profile,
            snapshot?.topArtists.medium ?? [],
            topGenres,
            similarArtists,
            feedback,
            {
              tasteVector,
              snapshot,
              wishlist,
              similarArtists,
              quizAlbumPreferences: quizResponses?.albumPreferences ?? [],
              quizSubGenres: Object.values(quizResponses?.subGenres ?? {}).flat(),
              quizRecognizedArtists: quizResponses?.recognizedArtists,
            },
          );
        } else {
          degraded.push(
            toSourceError(
              "spotify",
              "No Spotify-based candidates found — showing quiz-based picks instead.",
            ),
          );
          recommendations = await getQuizOnlyRecommendations(
            profile,
            feedback,
            wishlist,
            quizResponses?.recognizedArtists,
          );
        }
      } catch (error) {
        degraded.push(toSourceError("spotify", error));
        recommendations = await getQuizOnlyRecommendations(
          profile,
          feedback,
          wishlist,
          quizResponses?.recognizedArtists,
        );
      }
    } else {
      recommendations = await getQuizOnlyRecommendations(
        profile,
        feedback,
        wishlist,
        quizResponses?.recognizedArtists,
      );
    }

    if (excludedIds.size > 0) {
      recommendations = recommendations.filter(
        (r) => !excludedIds.has(r.discogsReleaseId),
      );
    }

    // Collapse duplicate pressings and spread genres before the (rate-limited)
    // enrichment pass, so we don't spend Discogs calls on dupes and the feed
    // leads with variety rather than one dominant sound.
    recommendations = dedupeRecommendations(recommendations);
    recommendations = diversifyByGenre(recommendations);

    if (recommendations.length > 0) {
      recommendations = await enrichRecommendations(recommendations);
      // Now that ratings/want counts are filled, re-score into a normalized
      // 0–100 blend so "best match" reflects quality, not just the raw sum.
      recommendations = finalizeScores(recommendations, profile.deepCutLevel);
      // And flag batch-relative "good value" picks now that price/want/have
      // are all filled in — upgraded to a real historical signal wherever
      // price_history has enough data (only ever true for releases someone
      // has wishlisted; see fair-value.ts and getPriceHistoryStatsForReleases).
      let fairValueByRelease = computeFairValue(recommendations);
      const releaseIds = recommendations.map((r) => r.discogsReleaseId);
      const historyByRelease = await getPriceHistoryStatsForReleases(
        releaseIds,
        FAIR_VALUE_HISTORY_LOOKBACK_DAYS,
      );
      fairValueByRelease = applyHistoricalFairValue(
        recommendations,
        fairValueByRelease,
        historyByRelease,
      );
      recommendations = recommendations.map((r) => ({
        ...r,
        fairValue: fairValueByRelease.get(r.discogsReleaseId) ?? false,
      }));
      await cacheRecommendations(userId, recommendations);
      await logEvent(userId, "recommendations_generated", {
        source,
        count: recommendations.length,
        withSpotifyReason: recommendations.filter((r) => hasSpotifyReason(r.reasons)).length,
      });
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
