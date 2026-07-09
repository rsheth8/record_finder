import type { QuizGenre, Recommendation } from "@/lib/types";
import { isDeepCut } from "@/lib/recommendations/filter";
import { normalize } from "@/lib/recommendations/match";

export type RecommendationRow = {
  id: string;
  title: string;
  items: Recommendation[];
};

const MIN_ROW_ITEMS = 3;

// Quiz genre labels use hyphens ("Hip-Hop") while raw Discogs genres use
// spaces ("Hip Hop") — normalize both sides so they're treated as the same
// genre instead of producing two near-duplicate rows.
function matchesGenre(rec: Recommendation, genre: string): boolean {
  const g = normalize(genre);
  return rec.genres.some((rg) => {
    const rgNorm = normalize(rg);
    return rgNorm.includes(g) || g.includes(rgNorm);
  });
}

function getTopGenres(recommendations: Recommendation[], limit = 4): string[] {
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
    .slice(0, limit)
    .map(([genre]) => genre);
}

/** How many genres (beyond whatever quiz genres the batch actually contains)
 * get their own scored row. Kept small on purpose — this batch is only ~36-40
 * items total, and breadth beyond this comes from the live catalog-browse row
 * queue (`browse-rows.ts`), not from subdividing this small scored batch
 * further. */
const MAX_SCORED_GENRE_ROWS = 2;

/** Rows built from the scored/personalized batch. None of these are mutually
 * exclusive with each other or with "Top picks" — each is a highlight reel
 * over the same shared pool, not a claim on it. Earlier versions had each row
 * remove its items from a shared pool, which meant "Top picks" (12 items) and
 * the first genre row could exhaust a ~36-40 item batch, starving every row
 * after it below MIN_ROW_ITEMS — the page would render one full row plus a
 * couple of nearly-empty ones and stop. Netflix rows overlap constantly (the
 * same title appears in "Top picks", its genre row, etc.); this does the
 * same, and relies on the browse-row queue for genuine breadth instead. */
export function groupRecommendations(
  recommendations: Recommendation[],
  quizGenres: QuizGenre[] = [],
): RecommendationRow[] {
  if (recommendations.length === 0) return [];

  const rows: RecommendationRow[] = [];

  const topPicks = [...recommendations]
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  if (topPicks.length > 0) {
    rows.push({ id: "top-picks", title: "Top picks for you", items: topPicks });
  }

  const genreCandidates = [
    ...quizGenres,
    ...getTopGenres(recommendations).filter(
      (g) => !quizGenres.some((qg) => normalize(qg) === normalize(g)),
    ),
  ];

  for (const genre of genreCandidates.slice(0, MAX_SCORED_GENRE_ROWS)) {
    const items = recommendations
      .filter((r) => matchesGenre(r, genre))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    if (items.length >= MIN_ROW_ITEMS) {
      rows.push({ id: `genre-${genre}`, title: genre, items });
    }
  }

  const deepCuts = recommendations
    .filter((r) => isDeepCut(r))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  if (deepCuts.length >= MIN_ROW_ITEMS) {
    rows.push({ id: "deep-cuts", title: "Deep cuts", items: deepCuts });
  }

  if (rows.length === 0) {
    rows.push({
      id: "all",
      title: "Recommended for you",
      items: recommendations,
    });
  }

  return rows;
}
