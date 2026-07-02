import { auth } from "@/lib/auth";
import {
  getSpotifySnapshot,
  getCachedRecommendations,
  cacheRecommendations,
  clearRecommendationCache,
  saveSpotifySnapshot,
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
} from "@/lib/recommendations/engine";
import { toSourceError, type SourceError } from "@/lib/errors";
import type { Recommendation } from "@/lib/types";

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
      return { recommendations: cached, degraded: [] };
    }
  } else {
    await clearRecommendationCache(userId);
  }

  const degraded: SourceError[] = [];

  try {
    const session = await auth();
    const snapshot = await getSpotifySnapshot(userId);
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
        if (!snapshot || snapshot.topArtists.length === 0) {
          topArtists = await fetchTopArtists(session.accessToken);
          topGenres = deriveTopGenres(topArtists);
          await saveSpotifySnapshot(userId, {
            topArtists,
            topAlbums: snapshot?.topAlbums ?? [],
            topGenres,
          });
        }

        const candidates = await fetchDiscoveryAlbums(
          session.accessToken,
          {
            artists: topArtists.slice(0, 3),
            genres: mapQuizGenresToSpotify(profile.genres),
          },
          30,
        );

        if (candidates.length > 0) {
          recommendations = await scoreCandidates(
            candidates,
            profile,
            topArtists,
            topGenres,
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

    if (recommendations.length > 0) {
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
