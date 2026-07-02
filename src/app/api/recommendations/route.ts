import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadRecommendations } from "@/lib/recommendations/load";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const result = await loadRecommendations(session.user.id, true);
  if (result.error && result.recommendations.length === 0) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({
    recommendations: result.recommendations,
    degraded: result.degraded,
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const result = await loadRecommendations(session.user.id, false);
  return NextResponse.json({
    recommendations: result.recommendations,
    error: result.error,
    degraded: result.degraded,
  });
}
