/**
 * Offer orchestrator — aggregates every source into one ranked "where to buy"
 * list. Adapters run in parallel and fail independently (one source down never
 * blanks the panel), results are de-duplicated and ranked by landed cost
 * (price + shipping), and the whole thing is cached per release to keep the
 * paid meta-search cost bounded.
 */

import type { DiscogsRelease } from "@/lib/types";
import type { Offer, OfferSource } from "./types";
import { buildReleaseKey, discogsOffer } from "./discogs";
import { searchGoogleShopping } from "./google-shopping";

/** Drop anything below "likely" — we never show a low-confidence guess. */
export const MIN_OFFER_CONFIDENCE = 0.75;
/** Most offers a panel shows (cheapest-first after ranking). */
export const MAX_OFFERS = 8;
/** Cache TTL. Prices move over hours, not seconds; this also bounds SerpApi $. */
export const OFFER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export interface SourceStatus {
  source: OfferSource;
  ok: boolean;
  count: number;
  error?: string;
}

export interface OfferResult {
  offers: Offer[];
  sources: SourceStatus[];
  fetchedAt: number;
}

/** Total cost to the buyer: item price + shipping (unknown shipping = 0). */
export function landedCost(o: Offer): number {
  if (o.price == null) return Infinity;
  return o.price + (o.shipping ?? 0);
}

/**
 * Drop duplicate listings. Same product URL is an obvious dupe; beyond that we
 * collapse identical seller+price rows. On a collision we keep the higher
 * confidence (and, tied, the one with known shipping).
 */
export function dedupeOffers(offers: Offer[]): Offer[] {
  const byKey = new Map<string, Offer>();
  for (const o of offers) {
    const key = o.url
      ? `url:${o.url}`
      : `sp:${(o.sellerName ?? "").toLowerCase()}:${o.price ?? "?"}`;
    const existing = byKey.get(key);
    if (
      !existing ||
      o.matchConfidence > existing.matchConfidence ||
      (o.matchConfidence === existing.matchConfidence &&
        existing.shipping == null &&
        o.shipping != null)
    ) {
      byKey.set(key, o);
    }
  }
  return [...byKey.values()];
}

/** Cheapest landed cost first; ties broken by higher match confidence. */
export function rankOffers(offers: Offer[]): Offer[] {
  return [...offers].sort((a, b) => {
    const la = landedCost(a);
    const lb = landedCost(b);
    if (la !== lb) return la - lb;
    return b.matchConfidence - a.matchConfidence;
  });
}

const cache = new Map<number, OfferResult>();

/**
 * Gather, rank, and cache offers for a release. `release.marketplace` is reused
 * so the Discogs offer is free; Google Shopping is the only networked source
 * and is skipped cleanly when no SerpApi key is configured.
 *
 * NOTE: cache is per-process/in-memory for now — fine for a single instance;
 * a shared DB-backed cache (mirroring `recommendation_cache`) is the prod step.
 */
export async function getOffers(
  release: DiscogsRelease,
  opts: { apiKey?: string; fresh?: boolean } = {},
): Promise<OfferResult> {
  const cached = cache.get(release.id);
  if (!opts.fresh && cached && Date.now() - cached.fetchedAt < OFFER_CACHE_TTL_MS) {
    return cached;
  }

  const key = buildReleaseKey(release);
  const sources: SourceStatus[] = [];
  const collected: Offer[] = [];

  // Discogs — synchronous, from already-fetched marketplace stats.
  const dOffer = discogsOffer(release);
  if (dOffer) collected.push(dOffer);
  sources.push({ source: "discogs", ok: true, count: dOffer ? 1 : 0 });

  // Google Shopping — networked + paid; isolate its failures.
  const apiKey = opts.apiKey ?? process.env.SERPAPI_KEY;
  if (apiKey) {
    try {
      const gOffers = await searchGoogleShopping(key, {
        apiKey,
        minConfidence: MIN_OFFER_CONFIDENCE,
      });
      collected.push(...gOffers);
      sources.push({ source: "google-shopping", ok: true, count: gOffers.length });
    } catch (e) {
      sources.push({
        source: "google-shopping",
        ok: false,
        count: 0,
        error: e instanceof Error ? e.message : "failed",
      });
    }
  }

  const offers = rankOffers(
    dedupeOffers(collected.filter((o) => o.matchConfidence >= MIN_OFFER_CONFIDENCE)),
  ).slice(0, MAX_OFFERS);

  const result: OfferResult = { offers, sources, fetchedAt: Date.now() };
  cache.set(release.id, result);
  return result;
}
