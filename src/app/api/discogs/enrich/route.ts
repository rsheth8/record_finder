import { NextRequest, NextResponse } from "next/server";
import { enrichRecommendations } from "@/lib/recommendations/enrich";
import {
  computeFairValue,
  applyHistoricalFairValue,
  FAIR_VALUE_HISTORY_LOOKBACK_DAYS,
} from "@/lib/recommendations/fair-value";
import { getPriceHistoryStatsForReleases } from "@/lib/db/queries";
import type { Recommendation } from "@/lib/types";

/** The client already has these (from a prior fast, unenriched
 * /api/discogs/search response) and sends them back rather than just ids —
 * the server would otherwise need a *second* search just to re-derive
 * title/artist/cover, defeating the point. Capped well above what any single
 * row/page actually requests enrichment for (see ENRICH_BATCH_SIZE in
 * browse-row.tsx / search-feed.tsx) as a sanity bound, not a real limit. */
const MAX_ITEMS = 30;

// One Discogs call per genuinely uncached item, serialized through the
// shared 1-req/sec throttle — same rationale as the old combined route had.
export const maxDuration = 30;

function isRecommendationShaped(value: unknown): value is Recommendation {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { discogsReleaseId?: unknown }).discogsReleaseId === "number"
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Missing items" }, { status: 400 });
  }
  if (items.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `Too many items (max ${MAX_ITEMS})` },
      { status: 400 },
    );
  }
  if (!items.every(isRecommendationShaped)) {
    return NextResponse.json({ error: "Invalid item shape" }, { status: 400 });
  }

  if (!process.env.DISCOGS_TOKEN) {
    return NextResponse.json(
      { error: "DISCOGS_TOKEN not configured" },
      { status: 500 },
    );
  }

  try {
    // Parallel, not sequential: the price-history lookup only needs release
    // ids (already known before enrichment), not enrichment's own output.
    const [enriched, historyByRelease] = await Promise.all([
      enrichRecommendations(items),
      getPriceHistoryStatsForReleases(
        items.map((r) => r.discogsReleaseId),
        FAIR_VALUE_HISTORY_LOOKBACK_DAYS,
      ),
    ]);

    let fairValueMap = computeFairValue(enriched);
    fairValueMap = applyHistoricalFairValue(enriched, fairValueMap, historyByRelease);
    const results = enriched.map((r) => ({
      ...r,
      fairValue: fairValueMap.get(r.discogsReleaseId) ?? false,
    }));

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Enrichment failed" },
      { status: 500 },
    );
  }
}
