/** Normalization + fuzzy-matching helpers for pairing a candidate album (from
 * Spotify or the quiz) with a Discogs vinyl release. Discogs' search returns the
 * best keyword hits, not exact matches, so we validate before trusting result[0]. */

/** Common leading words that shouldn't count toward token similarity. */
const NOISE_WORDS = new Set(["the", "a", "an", "and"]);

/** Lowercase, strip accents, drop parenthetical/bracketed qualifiers
 * (e.g. "(Deluxe Edition)", "[Remastered]"), and collapse punctuation to spaces. */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenize(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((t) => t.length > 0 && !NOISE_WORDS.has(t));
}

/** Token overlap in [0,1]: shared tokens / tokens in the smaller set. Robust to
 * word order, punctuation, and edition suffixes. */
export function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

/** Discogs release titles are formatted "Artist - Title"; split on the first
 * separator so hyphenated titles ("Wish You Were Here - Live") stay intact. */
export function splitDiscogsTitle(fullTitle: string): {
  artist: string;
  title: string;
} {
  const idx = fullTitle.indexOf(" - ");
  if (idx === -1) return { artist: "Unknown", title: fullTitle };
  return {
    artist: fullTitle.slice(0, idx).trim(),
    title: fullTitle.slice(idx + 3).trim(),
  };
}

export interface DiscogsSearchResult {
  id: number;
  title: string;
  year?: string;
  cover_image?: string;
  genre?: string[];
  style?: string[];
  format?: string[];
  community?: { want?: number; have?: number };
}

/** Confidence in [0,1] that a Discogs result is the album we searched for,
 * combining artist + title token similarity with a format preference (full LP
 * over singles/EPs, penalize compilations). */
export function scoreDiscogsMatch(
  queryArtist: string,
  queryTitle: string,
  result: DiscogsSearchResult,
): number {
  const { artist, title } = splitDiscogsTitle(result.title);
  const artistSim = tokenSimilarity(queryArtist, artist);
  const titleSim = tokenSimilarity(queryTitle, title);

  // Both halves must overlap — high title similarity alone can cross-match a
  // different artist's album of the same name.
  if (artistSim === 0 || titleSim === 0) return 0;

  let score = artistSim * 0.5 + titleSim * 0.5;

  const formats = (result.format ?? []).map((f) => f.toLowerCase());
  if (formats.some((f) => f.includes("single") || f === '7"')) score -= 0.15;
  if (formats.some((f) => f.includes("compilation"))) score -= 0.1;
  if (formats.some((f) => f.includes("lp") || f.includes("album"))) score += 0.05;

  return score;
}

/** Picks the highest-confidence Discogs vinyl match, or null if none clears the
 * confidence bar (so a bad candidate is dropped rather than mis-matched). */
export function pickBestMatch(
  queryArtist: string,
  queryTitle: string,
  results: DiscogsSearchResult[],
  minConfidence = 0.5,
): DiscogsSearchResult | null {
  let best: DiscogsSearchResult | null = null;
  let bestScore = minConfidence;

  for (const result of results) {
    const score = scoreDiscogsMatch(queryArtist, queryTitle, result);
    if (score >= bestScore) {
      bestScore = score;
      best = result;
    }
  }

  return best;
}

/** True when a release's formats indicate a full-length album rather than a
 * single/EP — used to honor the "full albums" quiz preference. */
export function isFullAlbum(formats: string[]): boolean {
  const lower = formats.map((f) => f.toLowerCase());
  if (lower.some((f) => f.includes("single") || f === '7"' || f.includes("ep"))) {
    return false;
  }
  return lower.some((f) => f.includes("lp") || f.includes("album"));
}
