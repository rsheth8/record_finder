import type { QuizDecade, Recommendation } from "@/lib/types";

export type SortOption =
  | "best_match"
  | "newest"
  | "oldest"
  | "highest_rated"
  | "artist_az";

export type DiscoverFilterState = {
  search: string;
  genres: string[];
  decades: QuizDecade[];
  sort: SortOption;
  deepCutOnly: boolean;
  minRating: number | null;
};

export const DEFAULT_DISCOVER_FILTERS: DiscoverFilterState = {
  search: "",
  genres: [],
  decades: [],
  sort: "best_match",
  deepCutOnly: false,
  minRating: null,
};

export function getAvailableGenres(recommendations: Recommendation[]): string[] {
  const counts = new Map<string, number>();

  for (const rec of recommendations) {
    for (const genre of rec.genres) {
      const key = genre.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([genre]) => genre);
}

function matchesDecade(rec: Recommendation, decade: QuizDecade): boolean {
  if (!rec.year) return false;
  const decadeNum = parseInt(decade.replace("s", ""), 10);
  return Math.floor(rec.year / 10) * 10 === decadeNum;
}

function isDeepCut(rec: Recommendation): boolean {
  if (rec.score < 40) return true;
  if (rec.ratingCount !== null && rec.ratingCount < 50) return true;
  return false;
}

export function filterRecommendations(
  recommendations: Recommendation[],
  filters: DiscoverFilterState,
): Recommendation[] {
  const query = filters.search.trim().toLowerCase();

  let results = recommendations.filter((rec) => {
    if (query) {
      const haystack = `${rec.title} ${rec.artist} ${rec.genres.join(" ")}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    if (filters.genres.length > 0) {
      const recGenres = rec.genres.map((g) => g.toLowerCase());
      const matches = filters.genres.some((g) =>
        recGenres.some(
          (rg) => rg.includes(g.toLowerCase()) || g.toLowerCase().includes(rg),
        ),
      );
      if (!matches) return false;
    }

    if (filters.decades.length > 0) {
      if (!filters.decades.some((d) => matchesDecade(rec, d))) return false;
    }

    if (filters.deepCutOnly && !isDeepCut(rec)) return false;

    if (filters.minRating !== null) {
      if (rec.communityRating === null || rec.communityRating < filters.minRating) {
        return false;
      }
    }

    return true;
  });

  results = sortRecommendations(results, filters.sort);
  return results;
}

export function sortRecommendations(
  recommendations: Recommendation[],
  sort: SortOption,
): Recommendation[] {
  const sorted = [...recommendations];

  switch (sort) {
    case "newest":
      return sorted.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    case "oldest":
      return sorted.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
    case "highest_rated":
      return sorted.sort(
        (a, b) => (b.communityRating ?? 0) - (a.communityRating ?? 0),
      );
    case "artist_az":
      return sorted.sort((a, b) => a.artist.localeCompare(b.artist));
    case "best_match":
    default:
      return sorted.sort((a, b) => b.score - a.score);
  }
}

/** Filters that narrow the result set (excludes sort-only changes). */
export function hasContentFilters(filters: DiscoverFilterState): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.genres.length > 0 ||
    filters.decades.length > 0 ||
    filters.deepCutOnly ||
    filters.minRating !== null
  );
}

export function hasActiveFilters(filters: DiscoverFilterState): boolean {
  return hasContentFilters(filters) || filters.sort !== "best_match";
}
