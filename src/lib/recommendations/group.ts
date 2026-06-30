import type { QuizDecade, QuizGenre, Recommendation } from "@/lib/types";

export type RecommendationRow = {
  id: string;
  title: string;
  items: Recommendation[];
};

function matchesGenre(rec: Recommendation, genre: QuizGenre): boolean {
  const g = genre.toLowerCase();
  return rec.genres.some(
    (rg) => rg.toLowerCase().includes(g) || g.includes(rg.toLowerCase()),
  );
}

export function groupRecommendations(
  recommendations: Recommendation[],
  quizGenres: QuizGenre[] = [],
  quizDecades: QuizDecade[] = [],
): RecommendationRow[] {
  if (recommendations.length === 0) return [];

  const used = new Set<number>();
  const rows: RecommendationRow[] = [];

  const topPicks = [...recommendations]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  if (topPicks.length > 0) {
    topPicks.forEach((r) => used.add(r.discogsReleaseId));
    rows.push({ id: "top-picks", title: "Top picks for you", items: topPicks });
  }

  for (const genre of quizGenres.slice(0, 4)) {
    const items = recommendations.filter(
      (r) =>
        !used.has(r.discogsReleaseId) && matchesGenre(r, genre),
    );
    if (items.length >= 2) {
      items.forEach((r) => used.add(r.discogsReleaseId));
      rows.push({ id: `genre-${genre}`, title: genre, items: items.slice(0, 12) });
    }
  }

  for (const decade of quizDecades.slice(0, 3)) {
    const decadeNum = parseInt(decade.replace("s", ""), 10);
    const items = recommendations.filter((r) => {
      if (used.has(r.discogsReleaseId)) return false;
      const y = r.year;
      if (!y) return false;
      return Math.floor(y / 10) * 10 === decadeNum;
    });
    if (items.length >= 2) {
      items.forEach((r) => used.add(r.discogsReleaseId));
      rows.push({
        id: `decade-${decade}`,
        title: `${decade} essentials`,
        items: items.slice(0, 12),
      });
    }
  }

  const deepCuts = recommendations
    .filter((r) => !used.has(r.discogsReleaseId) && (r.score < 40 || r.ratingCount === null))
    .slice(0, 12);

  if (deepCuts.length >= 2) {
    deepCuts.forEach((r) => used.add(r.discogsReleaseId));
    rows.push({ id: "deep-cuts", title: "Deep cuts", items: deepCuts });
  }

  const remaining = recommendations.filter((r) => !used.has(r.discogsReleaseId));
  if (remaining.length > 0) {
    rows.push({ id: "more", title: "More to explore", items: remaining.slice(0, 12) });
  }

  if (rows.length === 0) {
    rows.push({
      id: "all",
      title: "Recommended for you",
      items: recommendations.slice(0, 12),
    });
  }

  return rows;
}
