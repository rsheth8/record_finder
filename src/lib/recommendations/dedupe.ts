import type { Recommendation } from "@/lib/types";
import { normalize } from "@/lib/recommendations/match";

/** The strongest of two pressings of the same album: prefer the higher score,
 * then the more-wanted pressing (a proxy for the canonical/original release),
 * then one that actually has cover art. */
function isStronger(a: Recommendation, b: Recommendation): boolean {
  if (a.score !== b.score) return a.score > b.score;
  const aWant = a.wantCount ?? 0;
  const bWant = b.wantCount ?? 0;
  if (aWant !== bWant) return aWant > bWant;
  if (!!a.coverUrl !== !!b.coverUrl) return !!a.coverUrl;
  return false;
}

/** Collapses reissues/repressings of the same album — different Discogs release
 * ids but the same normalized artist + title — to a single strongest entry.
 * Discogs search happily returns several pressings of one record, so without
 * this the feed wastes slots on duplicates (e.g. three copies of one album). */
export function dedupeRecommendations(recs: Recommendation[]): Recommendation[] {
  const best = new Map<string, Recommendation>();
  for (const rec of recs) {
    const key = `${normalize(rec.artist)}::${normalize(rec.title)}`;
    const existing = best.get(key);
    if (!existing || isStronger(rec, existing)) best.set(key, rec);
  }
  return [...best.values()];
}

/** A pick's primary genre, used to measure feed variety. */
function primaryGenre(rec: Recommendation): string {
  return rec.genres[0]?.toLowerCase() ?? "unknown";
}

/** Reorders (never drops) picks so the feed alternates primary genres instead
 * of front-loading whichever genre dominates the pool. Buckets by primary
 * genre — each bucket already score-sorted — then round-robins across buckets,
 * visiting buckets by their best pick first so top picks stay near the front.
 * A monotone pool (one genre) passes through unchanged. */
export function diversifyByGenre(recs: Recommendation[]): Recommendation[] {
  const buckets = new Map<string, Recommendation[]>();
  for (const rec of recs) {
    const key = primaryGenre(rec);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(rec);
    else buckets.set(key, [rec]);
  }

  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => b.score - a.score);
  }

  // Order buckets by their strongest pick so the highest scorers lead.
  const ordered = [...buckets.values()].sort(
    (a, b) => (b[0]?.score ?? 0) - (a[0]?.score ?? 0),
  );

  const out: Recommendation[] = [];
  const cursors = ordered.map(() => 0);
  let remaining = recs.length;
  while (remaining > 0) {
    for (let i = 0; i < ordered.length; i++) {
      const bucket = ordered[i];
      if (cursors[i] < bucket.length) {
        out.push(bucket[cursors[i]]);
        cursors[i]++;
        remaining--;
      }
    }
  }
  return out;
}
