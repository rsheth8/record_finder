import { NextRequest, NextResponse } from "next/server";
import { searchCatalog, type SearchSortOption } from "@/lib/discogs/client";
import { enrichRecommendations } from "@/lib/recommendations/enrich";
import {
  computeFairValue,
  applyHistoricalFairValue,
  FAIR_VALUE_HISTORY_LOOKBACK_DAYS,
} from "@/lib/recommendations/fair-value";
import { getPriceHistoryStatsForReleases, logEvent } from "@/lib/db/queries";
import { getOrCreateUserId } from "@/lib/identity";
import { GENRE_DISCOGS_PARAM } from "@/lib/discogs/genre-map";
import { QUIZ_DECADES, type QuizDecade, type QuizGenre } from "@/lib/types";

const SEARCH_SORT_OPTIONS: SearchSortOption[] = [
  "relevance",
  "most_wanted",
  "newest",
  "oldest",
  "artist_az",
];

const MAX_QUERY_LENGTH = 100;

// Enrichment (price/rating) does one Discogs call per result, serialized
// through the shared 1-req/sec throttle — so it stays bounded to a subset of
// the page rather than scaling with SEARCH_PER_PAGE. The rest of the page
// still renders (title/artist/cover/year/genre/want-count all come free from
// the search call itself) just without a price badge; clicking through to the
// album page enriches that one release fully anyway via getRelease().
const SEARCH_ENRICH_LIMIT = 12;

// Enrichment does one Discogs call per enriched result on top of the search
// itself, all serialized through the shared 1-req/sec throttle — matches the
// /api/recommendations precedent for a rate-limited Discogs pass that can
// take longer than the default ceiling.
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const genreParam = searchParams.get("genre");
  const genre =
    genreParam && genreParam in GENRE_DISCOGS_PARAM
      ? (genreParam as QuizGenre)
      : undefined;
  const decadeParam = searchParams.get("decade");
  const decade = QUIZ_DECADES.includes(decadeParam as QuizDecade)
    ? (decadeParam as QuizDecade)
    : undefined;
  const sortParam = searchParams.get("sort");
  const sort = SEARCH_SORT_OPTIONS.includes(sortParam as SearchSortOption)
    ? (sortParam as SearchSortOption)
    : undefined;

  if (!process.env.DISCOGS_TOKEN) {
    return NextResponse.json(
      { error: "DISCOGS_TOKEN not configured" },
      { status: 500 },
    );
  }

  // A missing query is only valid as a pure catalog browse (Discover's
  // infinite-scroll rows) — it must be anchored by at least a genre or decade
  // filter, otherwise it's just a malformed search request.
  if (!q && !genre && !decade) {
    return NextResponse.json({ error: "Missing search query" }, { status: 400 });
  }
  if (q.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: "Search query too long" }, { status: 400 });
  }

  try {
    const { results, pagination } = await searchCatalog(q, page, {
      genre,
      decade,
      sort,
    });
    const toEnrich = results.slice(0, SEARCH_ENRICH_LIMIT);
    const rest = results.slice(SEARCH_ENRICH_LIMIT);

    const enriched = await enrichRecommendations(toEnrich);
    let fairValueMap = computeFairValue(enriched);
    const historyByRelease = await getPriceHistoryStatsForReleases(
      enriched.map((r) => r.discogsReleaseId),
      FAIR_VALUE_HISTORY_LOOKBACK_DAYS,
    );
    fairValueMap = applyHistoricalFairValue(enriched, fairValueMap, historyByRelease);
    const enrichedWithFairValue = enriched.map((r) => ({
      ...r,
      fairValue: fairValueMap.get(r.discogsReleaseId) ?? false,
    }));
    // Order is preserved: toEnrich/rest is a straight split of `results`, so
    // concatenating reconstructs the original (relevance-sorted) order.
    const withFairValue = [
      ...enrichedWithFairValue,
      ...rest.map((r) => ({ ...r, fairValue: false })),
    ];

    // A genre/decade-only browse call (Discover's infinite-scroll rows) isn't
    // a user-initiated search — only log the funnel event for real queries.
    if (page === 1 && q) {
      const userId = await getOrCreateUserId();
      await logEvent(userId, "search_performed", { resultCount: results.length });
    }

    return NextResponse.json({ results: withFairValue, pagination });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed" },
      { status: 500 },
    );
  }
}
