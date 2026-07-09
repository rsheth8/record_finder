import { QUIZ_DECADES, QUIZ_GENRES, type QuizDecade, type QuizGenre } from "@/lib/types";
import type { SearchSortOption } from "@/lib/discogs/client";
import { normalize } from "@/lib/recommendations/match";

export type BrowseRowDef = {
  id: string;
  title: string;
  genre?: QuizGenre;
  decade?: QuizDecade;
  sort?: SearchSortOption;
};

/** Builds a large, deterministic queue of live-catalog browse rows for
 * Discover's infinite vertical scroll. Unlike the scored rows in `group.ts`
 * (bounded by a ~36-40 item batch), each row here is its own Discogs query —
 * so breadth doesn't run out just because the scored batch is small. Ordered
 * so the user's own quiz answers surface first, then the rest of the catalog
 * taxonomy, then a couple of evergreen rows — reaching the end of this queue
 * genuinely requires a lot of scrolling. */
export function buildBrowseRowQueue(
  quizGenres: QuizGenre[],
  quizDecades: QuizDecade[],
  usedGenres: string[] = [],
): BrowseRowDef[] {
  const usedNormalized = new Set(usedGenres.map((g) => normalize(g)));
  const queuedGenres = new Set<QuizGenre>();
  const queuedDecades = new Set<QuizDecade>();
  const rows: BrowseRowDef[] = [];

  function addGenreRow(genre: QuizGenre) {
    if (queuedGenres.has(genre) || usedNormalized.has(normalize(genre))) return;
    queuedGenres.add(genre);
    rows.push({ id: `browse-genre-${genre}`, title: genre, genre, sort: "most_wanted" });
  }

  function addDecadeRow(decade: QuizDecade) {
    if (queuedDecades.has(decade)) return;
    queuedDecades.add(decade);
    rows.push({
      id: `browse-decade-${decade}`,
      title: `${decade} essentials`,
      decade,
      sort: "most_wanted",
    });
  }

  for (const genre of quizGenres) addGenreRow(genre);
  for (const decade of quizDecades) addDecadeRow(decade);

  // So scrolling never hard-stops once the user's own quiz answers are
  // exhausted: every remaining genre/decade in the full taxonomy.
  for (const genre of QUIZ_GENRES) addGenreRow(genre);
  for (const decade of QUIZ_DECADES) addDecadeRow(decade);

  rows.push({ id: "browse-most-wanted", title: "Most wanted right now", sort: "most_wanted" });
  rows.push({ id: "browse-new-arrivals", title: "Fresh pressings", sort: "newest" });

  return rows;
}
