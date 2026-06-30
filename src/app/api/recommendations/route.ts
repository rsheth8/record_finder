import { NextResponse } from "next/server";
import { loadRecommendations } from "@/lib/recommendations/load";

export async function POST() {
  const result = await loadRecommendations(true);
  if (result.error && result.recommendations.length === 0) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ recommendations: result.recommendations });
}

export async function GET() {
  const result = await loadRecommendations(false);
  return NextResponse.json({
    recommendations: result.recommendations,
    error: result.error,
  });
}
