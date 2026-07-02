import {
  getTasteProfileFromDb,
  saveTasteProfileToDb,
  clearRecommendationCache,
} from "@/lib/db/queries";
import type { TasteProfileData } from "@/lib/types";

export async function getTasteProfile(
  userId: string,
): Promise<TasteProfileData | null> {
  return getTasteProfileFromDb(userId);
}

export async function saveTasteProfile(
  userId: string,
  data: Omit<TasteProfileData, "completedAt"> & { completed?: boolean },
): Promise<TasteProfileData | null> {
  await saveTasteProfileToDb(userId, data);
  // Completing (or re-taking) the quiz changes the inputs, so the previously
  // cached picks are stale — drop them so the next visit regenerates.
  if (data.completed) {
    await clearRecommendationCache(userId);
  }
  return getTasteProfileFromDb(userId);
}
