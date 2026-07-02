import type { Recommendation, RecommendationMarketplace } from "@/lib/types";
import { getMarketplaceStats } from "@/lib/discogs/client";

export async function enrichWithMarketplace(
  rec: Recommendation,
): Promise<Recommendation> {
  const stats = await getMarketplaceStats(rec.discogsReleaseId);
  if (!stats) return rec;

  const marketplace: RecommendationMarketplace = {
    lowestPrice: stats.lowestPrice,
    currency: stats.currency,
    numForSale: stats.numForSale,
    discogsUrl: stats.discogsUrl,
  };

  return { ...rec, marketplace };
}

export async function enrichRecommendations(
  recommendations: Recommendation[],
): Promise<Recommendation[]> {
  const enriched: Recommendation[] = [];

  for (const rec of recommendations) {
    enriched.push(await enrichWithMarketplace(rec));
    await new Promise((r) => setTimeout(r, 350));
  }

  return enriched;
}
