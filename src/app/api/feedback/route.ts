import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getUserFeedback,
  setFeedback,
  removeFeedback,
  clearRecommendationCache,
} from "@/lib/db/queries";
import { feedbackSchema } from "@/lib/validation/feedback";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  return NextResponse.json(await getUserFeedback(session.user.id));
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const parsed = feedbackSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  await setFeedback(session.user.id, parsed.data);
  // Feedback changes ranking/eligibility, so drop the cached picks.
  await clearRecommendationCache(session.user.id);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("discogsReleaseId");
  if (!id) {
    return NextResponse.json({ error: "Missing discogsReleaseId" }, { status: 400 });
  }

  await removeFeedback(session.user.id, parseInt(id, 10));
  await clearRecommendationCache(session.user.id);

  return NextResponse.json({ ok: true });
}
