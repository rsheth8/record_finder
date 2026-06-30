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
  fetchRecommendations,
  fetchTopArtists,
  deriveTopGenres,
} from "@/lib/spotify/client";
import {
  scoreCandidates,
  getQuizOnlyRecommendations,
  mapQuizGenresToSpotify,
} from "@/lib/recommendations/engine";
import type { Recommendation } from "@/lib/types";

export async function loadRecommendations(
  refresh = false,
): Promise<{ recommendations: Recommendation[]; error?: string }> {
  const profile = await getTasteProfile();
  if (!profile?.completedAt) {
    return { recommendations: [], error: "Complete the taste quiz first" };
  }

  if (!refresh) {
    const cached = getCachedRecommendations();
    if (cached && cached.length > 0) {
      return { recommendations: cached };
    }
  } else {
    clearRecommendationCache();
  }

  try {
    const session = await auth();
    const snapshot = getSpotifySnapshot();
    let recommendations: Recommendation[];

    if (session?.accessToken) {
      let topArtists = snapshot?.topArtists ?? [];
      let topGenres = snapshot?.topGenres ?? [];

      if (!snapshot || snapshot.topArtists.length === 0) {
        topArtists = await fetchTopArtists(session.accessToken);
        topGenres = deriveTopGenres(topArtists);
        saveSpotifySnapshot({
          topArtists,
          topAlbums: snapshot?.topAlbums ?? [],
          topGenres,
        });
      }

      const seeds = {
        artists: topArtists.slice(0, 3).map((a) => a.id),
        genres: mapQuizGenresToSpotify(profile.genres),
      };

      const candidates = await fetchRecommendations(
        session.accessToken,
        seeds,
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
        recommendations = await getQuizOnlyRecommendations(profile);
      }
    } else {
      recommendations = await getQuizOnlyRecommendations(profile);
    }

    if (recommendations.length > 0) {
      cacheRecommendations(recommendations);
    }

    return { recommendations };
  } catch (error) {
    return {
      recommendations: [],
      error:
        error instanceof Error
          ? error.message
          : "Failed to generate recommendations",
    };
  }
}
