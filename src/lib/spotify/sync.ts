import {
  saveSpotifySnapshot,
  clearRecommendationCache,
  getQuizResponses,
} from "@/lib/db/queries";
import { fetchFullListeningSnapshot } from "@/lib/spotify/client";
import { deriveTasteProfile } from "@/lib/taste/derive-profile";
import type { SpotifyListeningSnapshot, TasteVector } from "@/lib/types";

export type SyncResult = SpotifyListeningSnapshot & {
  tasteVector: TasteVector;
  stats: {
    savedAlbums: number;
    savedTracks: number;
    recentlyPlayed: number;
  };
};

export async function syncSpotifyListening(
  userId: string,
  accessToken: string,
): Promise<SyncResult> {
  const snapshot = await fetchFullListeningSnapshot(accessToken);
  const quizResponses = await getQuizResponses(userId);
  const tasteVector = deriveTasteProfile(
    snapshot,
    quizResponses?.albumPreferences ?? [],
  );

  await saveSpotifySnapshot(userId, { ...snapshot, tasteVector });
  await clearRecommendationCache(userId);

  return {
    ...snapshot,
    tasteVector,
    stats: {
      savedAlbums: snapshot.savedAlbums.length,
      savedTracks: snapshot.savedTracks.length,
      recentlyPlayed: snapshot.recentlyPlayed.length,
    },
  };
}
