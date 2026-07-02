import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, getOrCreateUserId } from "@/lib/identity";
import { getTasteProfile, saveTasteProfile } from "@/lib/taste-profile-store";
import { saveQuizSchema } from "@/lib/validation/quiz";
import {
  getQuizResponses,
  saveQuizResponses,
  getSpotifySnapshot,
  saveSpotifySnapshot,
} from "@/lib/db/queries";
import { deriveTasteProfile } from "@/lib/taste/derive-profile";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json(null);
  const [profile, responses] = await Promise.all([
    getTasteProfile(userId),
    getQuizResponses(userId),
  ]);
  return NextResponse.json({ profile, responses });
}

export async function POST(request: NextRequest) {
  const parsed = saveQuizSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const userId = await getOrCreateUserId();
  const { subGenres, albumPreferences, ...profileData } = parsed.data;

  await saveQuizResponses(userId, {
    albumPreferences,
    subGenres,
  });

  const profile = await saveTasteProfile(userId, profileData);

  if (parsed.data.completed) {
    const snapshot = await getSpotifySnapshot(userId);
    if (snapshot && snapshot.topArtists.medium.length > 0) {
      const tasteVector = deriveTasteProfile(
        snapshot,
        albumPreferences,
      );
      await saveSpotifySnapshot(userId, {
        ...snapshot,
        tasteVector,
      });
    }
  }

  return NextResponse.json({ profile, responses: { albumPreferences, subGenres } });
}
