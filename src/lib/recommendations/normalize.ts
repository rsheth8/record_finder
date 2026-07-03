import type { Recommendation, RecommendationMarketplace } from "@/lib/types";

/** Older cached picks may store Discogs' { value, currency } object as lowestPrice.
 * Coerce back to a numeric USD-friendly shape so UI and credit math don't NaN. */
function normalizeMarketplace(
  marketplace: RecommendationMarketplace,
): RecommendationMarketplace {
  const raw = marketplace.lowestPrice as unknown;

  if (raw == null) {
    return { ...marketplace, lowestPrice: null, currency: "USD" };
  }

  if (typeof raw === "number") {
    return {
      ...marketplace,
      lowestPrice: Number.isFinite(raw) ? raw : null,
      currency: "USD",
    };
  }

  if (typeof raw === "object" && raw !== null && "value" in raw) {
    const value = (raw as { value?: number | null }).value;
    return {
      ...marketplace,
      lowestPrice:
        typeof value === "number" && Number.isFinite(value) ? value : null,
      currency: "USD",
    };
  }

  return { ...marketplace, lowestPrice: null, currency: "USD" };
}

export function normalizeRecommendation(rec: Recommendation): Recommendation {
  // Legacy cached picks predate some fields. The discover feed groups and
  // renders these without guarding (e.g. iterating `genres`, reading
  // `reasons[0]`), so coerce the array fields back to arrays before they reach
  // the UI — otherwise a stale cache entry crashes the whole section.
  const normalized: Recommendation = {
    ...rec,
    genres: Array.isArray(rec.genres) ? rec.genres : [],
    formats: Array.isArray(rec.formats) ? rec.formats : [],
    reasons: Array.isArray(rec.reasons) ? rec.reasons : [],
  };
  if (!normalized.marketplace) return normalized;
  return { ...normalized, marketplace: normalizeMarketplace(normalized.marketplace) };
}

export function normalizeRecommendations(recs: Recommendation[]): Recommendation[] {
  return recs.map(normalizeRecommendation);
}
