import { NextRequest, NextResponse } from "next/server";
import { getTasteProfile, saveTasteProfile } from "@/lib/db/queries";
import type { AlbumPreference, QuizDecade, QuizGenre, QuizMood } from "@/lib/types";

export async function GET() {
  const profile = getTasteProfile();
  return NextResponse.json(profile);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const data = {
    genres: (body.genres ?? []) as QuizGenre[],
    decades: (body.decades ?? []) as QuizDecade[],
    moods: (body.moods ?? []) as QuizMood[],
    albumPreference: (body.albumPreference ?? "balanced") as AlbumPreference,
    deepCutLevel: Number(body.deepCutLevel ?? 50),
    completed: Boolean(body.completed),
  };

  saveTasteProfile(data);
  return NextResponse.json(getTasteProfile());
}
