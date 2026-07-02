import { NextRequest, NextResponse } from "next/server";
import {
  getUserFeedback,
  setFeedback,
  removeFeedback,
  clearRecommendationCache,
} from "@/lib/db/queries";
import { getCurrentUserId } from "@/lib/identity";
import { feedbackSchema } from "@/lib/validation/feedback";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Complete the quiz first" }, { status: 401 });
  }
  return NextResponse.json(await getUserFeedback(userId));
}

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Complete the quiz first" }, { status: 401 });
  }

  const parsed = feedbackSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  await setFeedback(userId, parsed.data);
  await clearRecommendationCache(userId);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Complete the quiz first" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("discogsReleaseId");
  if (!id) {
    return NextResponse.json({ error: "Missing discogsReleaseId" }, { status: 400 });
  }

  await removeFeedback(userId, parseInt(id, 10));
  await clearRecommendationCache(userId);

  return NextResponse.json({ ok: true });
}
