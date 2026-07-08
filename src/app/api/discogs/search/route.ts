import { NextRequest, NextResponse } from "next/server";
import { searchCatalog } from "@/lib/discogs/client";
import { enrichRecommendations } from "@/lib/recommendations/enrich";
import {
  computeFairValue,
  applyHistoricalFairValue,
  FAIR_VALUE_HISTORY_LOOKBACK_DAYS,
} from "@/lib/recommendations/fair-value";
import { getPriceHistoryStatsForReleases } from "@/lib/db/queries";

const MAX_QUERY_LENGTH = 100;

// Enrichment does one Discogs call per result on top of the search itself, all
// serialized through the shared 1-req/sec throttle — matches the /api/recommendations
// precedent for a rate-limited Discogs pass that can take longer than the default ceiling.
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

  if (!process.env.DISCOGS_TOKEN) {
    return NextResponse.json(
      { error: "DISCOGS_TOKEN not configured" },
      { status: 500 },
    );
  }

  if (!q) {
    return NextResponse.json({ error: "Missing search query" }, { status: 400 });
  }
  if (q.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: "Search query too long" }, { status: 400 });
  }

  try {
    const { results, pagination } = await searchCatalog(q, page);
    const enriched = await enrichRecommendations(results);
    let fairValueMap = computeFairValue(enriched);
    const historyByRelease = await getPriceHistoryStatsForReleases(
      enriched.map((r) => r.discogsReleaseId),
      FAIR_VALUE_HISTORY_LOOKBACK_DAYS,
    );
    fairValueMap = applyHistoricalFairValue(enriched, fairValueMap, historyByRelease);
    const withFairValue = enriched.map((r) => ({
      ...r,
      fairValue: fairValueMap.get(r.discogsReleaseId) ?? false,
    }));
    return NextResponse.json({ results: withFairValue, pagination });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed" },
      { status: 500 },
    );
  }
}
