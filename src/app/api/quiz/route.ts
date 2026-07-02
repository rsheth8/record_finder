import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, getOrCreateUserId } from "@/lib/identity";
import { getTasteProfile, saveTasteProfile } from "@/lib/taste-profile-store";
import { saveQuizSchema } from "@/lib/validation/quiz";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json(null);
  const profile = await getTasteProfile(userId);
  return NextResponse.json(profile);
}

export async function POST(request: NextRequest) {
  const parsed = saveQuizSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Guests are allowed to take the quiz — mint an anonymous id if needed.
  const userId = await getOrCreateUserId();
  const profile = await saveTasteProfile(userId, parsed.data);
  return NextResponse.json(profile);
}
