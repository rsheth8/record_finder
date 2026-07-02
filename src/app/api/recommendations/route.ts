import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/identity";
import { loadRecommendations } from "@/lib/recommendations/load";

// Generation runs a rate-limited, serial Discogs pass that can take ~25s+.
// Raise the serverless function ceiling so it isn't killed mid-flight.
export const maxDuration = 60;

export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Take the quiz first" },
      { status: 400 },
    );
  }
  const result = await loadRecommendations(userId, true);
  if (result.error && result.recommendations.length === 0) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({
    recommendations: result.recommendations,
    degraded: result.degraded,
  });
}

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Take the quiz first" }, { status: 400 });
  }
  const result = await loadRecommendations(userId, false);
  return NextResponse.json({
    recommendations: result.recommendations,
    error: result.error,
    degraded: result.degraded,
  });
}
