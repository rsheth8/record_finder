import type { Recommendation } from "@/lib/types";
import { getAccountCurrency, getReleaseEnrichment } from "@/lib/discogs/client";

/** Fills marketplace price/stock, community rating, and want/have for one pick
 * from a single `/releases/{id}` call. Leaves the pick untouched if the call
 * fails so a transient Discogs error never drops it from the feed. */
export async function enrichRecommendation(
  rec: Recommendation,
  accountCurrency: string,
): Promise<Recommendation> {
  const data = await getReleaseEnrichment(rec.discogsReleaseId, accountCurrency);
  if (!data) return rec;

  return {
    ...rec,
    communityRating: data.communityRating ?? rec.communityRating,
    ratingCount: data.ratingCount ?? rec.ratingCount,
    wantCount: data.wantCount ?? rec.wantCount,
    haveCount: data.haveCount ?? rec.haveCount,
    marketplace: data.marketplace,
  };
}

/** Serial by design: Discogs is rate-limited to ~1 req/sec and the shared
 * throttle already paces calls, so no artificial delay is needed here. The
 * account currency is read once up front (release prices come back as a bare
 * number in it), sampling the most-wanted pick since it's likeliest to have
 * active listings that report a currency. */
export async function enrichRecommendations(
  recommendations: Recommendation[],
): Promise<Recommendation[]> {
  if (recommendations.length === 0) return recommendations;

  const sample = [...recommendations].sort(
    (a, b) => (b.wantCount ?? 0) - (a.wantCount ?? 0),
  )[0];
  const currency = await getAccountCurrency(sample.discogsReleaseId);

  const enriched: Recommendation[] = [];
  for (const rec of recommendations) {
    enriched.push(await enrichRecommendation(rec, currency));
  }
  return enriched;
}
