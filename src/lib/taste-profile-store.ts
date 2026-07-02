import {
  getTasteProfileFromDb,
  saveTasteProfileToDb,
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
  return getTasteProfileFromDb(userId);
}
