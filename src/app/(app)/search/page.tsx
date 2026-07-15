import { SearchFeed } from "@/components/search/search-feed";
import { DEFAULT_SEARCH_FILTERS, type SearchFilterState } from "@/components/search/search-filters";
import { getCurrentUserId } from "@/lib/identity";
import { getTasteProfile } from "@/lib/taste-profile-store";
import { GENRE_DISCOGS_PARAM } from "@/lib/discogs/genre-map";
import { SEARCH_FORMATS, type SearchFormat, type SearchSortOption } from "@/lib/discogs/client";
import { QUIZ_DECADES, type QuizDecade, type QuizGenre } from "@/lib/types";

export const dynamic = "force-dynamic";

const SORT_OPTIONS: SearchSortOption[] = [
  "relevance",
  "most_wanted",
  "newest",
  "oldest",
  "artist_az",
];

/** Parse and validate the shareable filter params from the URL so a bookmarked
 * or shared filtered search restores its full state on load (mirrors the
 * validation in the API route so an invalid param is dropped, not trusted). */
function parseFilters(params: {
  genre?: string;
  decade?: string;
  format?: string;
  sort?: string;
}): SearchFilterState {
  return {
    ...DEFAULT_SEARCH_FILTERS,
    genre:
      params.genre && params.genre in GENRE_DISCOGS_PARAM
        ? (params.genre as QuizGenre)
        : null,
    decade: QUIZ_DECADES.includes(params.decade as QuizDecade)
      ? (params.decade as QuizDecade)
      : null,
    format: SEARCH_FORMATS.includes(params.format as SearchFormat)
      ? (params.format as SearchFormat)
      : null,
    sort: SORT_OPTIONS.includes(params.sort as SearchSortOption)
      ? (params.sort as SearchSortOption)
      : "relevance",
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    genre?: string;
    decade?: string;
    format?: string;
    sort?: string;
  }>;
}) {
  const { q, genre, decade, format, sort } = await searchParams;
  const filters = parseFilters({ genre, decade, format, sort });

  // Seed the launchpad's "from your taste" shortcuts with the visitor's quiz
  // genres when they've taken it — read-only, guest-safe.
  const userId = await getCurrentUserId();
  const profile = userId ? await getTasteProfile(userId) : null;
  const tasteGenres = (profile?.genres ?? []).slice(0, 4);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
          Search
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          Look up any artist or album on vinyl — real Discogs pressings, priced and rated.
        </p>
      </div>
      <SearchFeed
        initialQuery={q ?? ""}
        initialFilters={filters}
        tasteGenres={tasteGenres}
      />
    </div>
  );
}
