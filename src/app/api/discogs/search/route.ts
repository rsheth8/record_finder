import { NextRequest, NextResponse } from "next/server";
import {
  searchCatalog,
  SEARCH_FORMATS,
  type SearchSortOption,
  type SearchFormat,
} from "@/lib/discogs/client";
import { logEvent } from "@/lib/db/queries";
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

// This route deliberately does NOT enrich (price/rating/want/have) — it used
// to, blocking the whole response on up to 12 serialized, rate-limited
// Discogs calls (~13s). Enrichment is now a separate, client-triggered
// follow-up call to POST /api/discogs/enrich for just the items about to be
// visible, so the list itself (covers/titles/artist/year/genre/want-count —
// all free from this search call) renders almost immediately, with price/
// rating badges popping in a beat later. See browse-row.tsx / search-feed.tsx.
export const maxDuration = 15;

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
  const formatParam = searchParams.get("format");
  const format = SEARCH_FORMATS.includes(formatParam as SearchFormat)
    ? (formatParam as SearchFormat)
    : undefined;

  if (!process.env.DISCOGS_TOKEN) {
    return NextResponse.json(
      { error: "DISCOGS_TOKEN not configured" },
      { status: 500 },
    );
  }

  // A missing query is only valid as a pure catalog browse (Discover's
  // infinite-scroll rows), anchored by a genre/decade filter or a real sort
  // (e.g. "Most wanted right now"/"Fresh pressings" have neither genre nor
  // decade — sort=most_wanted/newest over the whole catalog is itself a
  // legitimate browse, not a malformed request).
  if (!q && !genre && !decade && !sort) {
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
      format,
    });
    // Unenriched: no price/rating/fairValue yet (all default to null/false).
    // The client requests enrichment for just the items about to be visible
    // via a separate POST /api/discogs/enrich call.
    const bare = results.map((r) => ({ ...r, fairValue: false }));

    // A genre/decade-only browse call (Discover's infinite-scroll rows) isn't
    // a user-initiated search — only log the funnel event for real queries.
    if (page === 1 && q) {
      const userId = await getOrCreateUserId();
      await logEvent(userId, "search_performed", { resultCount: results.length });
    }

    return NextResponse.json({ results: bare, pagination });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed" },
      { status: 500 },
    );
  }
}
