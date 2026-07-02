import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTasteProfile, saveTasteProfile } from "@/lib/taste-profile-store";
import { saveQuizSchema } from "@/lib/validation/quiz";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const profile = await getTasteProfile(session.user.id);
  return NextResponse.json(profile);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const parsed = saveQuizSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const profile = await saveTasteProfile(session.user.id, parsed.data);
  return NextResponse.json(profile);
}
