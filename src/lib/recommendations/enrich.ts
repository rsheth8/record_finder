import type { Recommendation, RecommendationMarketplace } from "@/lib/types";
import { getAccountCurrency, getReleaseEnrichment } from "@/lib/discogs/client";
import { getCachedReleaseEnrichments, cacheReleaseEnrichment } from "@/lib/db/queries";

export interface EnrichmentData {
  communityRating: number | null;
  ratingCount: number | null;
  wantCount: number | null;
  haveCount: number | null;
  marketplace: RecommendationMarketplace;
}

/** How long a DB-cached enrichment stays fresh before a request re-fetches it
 * from Discogs — matches the in-memory cache in discogs/client.ts so the two
 * tiers agree on freshness. DB-backed so it survives serverless cold starts
 * and is shared across instances, unlike the in-memory tier alone. */
const RELEASE_ENRICHMENT_DB_TTL_MS = 30 * 60 * 1000;

/** Batch-fetches enrichment for a set of releases: one DB round trip for
 * every id at once (not one per release), falling through per-miss to the
 * in-memory-cached Discogs client — genre/decade/most-wanted browse rows
 * overlap heavily on popular titles, so misses shrink fast as a session goes
 * on. Successful misses are written back to the DB cache (fire-and-forget;
 * a write failure must not fail the enrichment response it's caching for
 * next time) so future requests, including from a different cold-started
 * instance, hit the DB tier instead of Discogs. Absent from the returned map
 * means "no enrichment available" (miss or failed fetch) — never a null
 * value, so callers can use a plain `.has()`/`.get()`. */
export async function getEnrichmentForReleases(
  discogsReleaseIds: number[],
  accountCurrency: string,
): Promise<Map<number, EnrichmentData>> {
  if (discogsReleaseIds.length === 0) return new Map();

  const dbCached = await getCachedReleaseEnrichments(discogsReleaseIds, accountCurrency);
  const result = new Map<number, EnrichmentData>(
    dbCached as Map<number, EnrichmentData>,
  );

  const misses = discogsReleaseIds.filter((id) => !dbCached.has(id));

  await Promise.all(
    misses.map(async (id) => {
      const data = await getReleaseEnrichment(id, accountCurrency);
      if (!data) return;
      result.set(id, data);
      void cacheReleaseEnrichment(id, accountCurrency, data, RELEASE_ENRICHMENT_DB_TTL_MS).catch(
        () => {},
      );
    }),
  );

  return result;
}

/** Dispatched concurrently, not serially — see `getEnrichmentForReleases`
 * above for why cache hits (DB or in-memory) resolve instantly instead of
 * queuing behind genuine misses, which are still correctly paced by the
 * shared `discogsThrottle` regardless of how many callers are in flight. The
 * account currency is read once up front (also cached — see
 * `getAccountCurrency`), sampling the most-wanted pick since it's likeliest
 * to have active listings that report a currency. */
export async function enrichRecommendations(
  recommendations: Recommendation[],
): Promise<Recommendation[]> {
  if (recommendations.length === 0) return recommendations;

  const orderedByWant = [...recommendations].sort(
    (a, b) => (b.wantCount ?? 0) - (a.wantCount ?? 0),
  );
  const currency = await getAccountCurrency(orderedByWant[0].discogsReleaseId);

  const enrichmentByRelease = await getEnrichmentForReleases(
    orderedByWant.map((r) => r.discogsReleaseId),
    currency,
  );

  return recommendations.map((rec) => {
    const data = enrichmentByRelease.get(rec.discogsReleaseId);
    if (!data) return rec;
    return {
      ...rec,
      communityRating: data.communityRating ?? rec.communityRating,
      ratingCount: data.ratingCount ?? rec.ratingCount,
      wantCount: data.wantCount ?? rec.wantCount,
      haveCount: data.haveCount ?? rec.haveCount,
      marketplace: data.marketplace,
    };
  });
}
