/**
 * Google Shopping meta-search adapter (SPIKE) via SerpApi.
 *
 * One integration returns live prices across ~every retailer Google indexes
 * (Amazon, eBay, Walmart, Bing, and countless shops), which is the fastest path
 * to "the most sources possible". The mapping function is pure and unit-tested;
 * the live call is gated on SERPAPI_KEY so the pipeline is key-ready without a
 * paid key present.
 *
 * Docs: https://serpapi.com/google-shopping-api
 */

import type { Offer, OfferCandidate, ReleaseKey } from "./types";
import { classifyTier, scoreMatch } from "./match";

/** Minimal shape of one SerpApi `shopping_results` item we rely on. */
export interface SerpShoppingItem {
  title?: string;
  product_link?: string;
  link?: string;
  source?: string; // the retailer, e.g. "Amazon.com", "Walmart"
  price?: string;
  extracted_price?: number;
  second_hand_condition?: string;
  delivery?: string; // e.g. "Free delivery" / "$5.99 delivery"
}

/** Parse SerpApi's `delivery` string into a shipping number when possible. */
export function parseDelivery(delivery: string | undefined): number | null {
  if (!delivery) return null;
  if (/free/i.test(delivery)) return 0;
  const m = delivery.match(/\$([0-9]+(?:\.[0-9]{1,2})?)/);
  return m ? parseFloat(m[1]) : null;
}

/** Pure: map one SerpApi item into a scored Offer against the target release. */
export function serpItemToOffer(item: SerpShoppingItem, key: ReleaseKey): Offer {
  const candidate: OfferCandidate = {
    title: item.title ?? "",
    // SerpApi Google Shopping rarely exposes a UPC on the list item, so this is
    // usually a fuzzy match; the field is here for when it does.
    upc: null,
    formatHint: item.second_hand_condition ?? null,
  };
  const match = scoreMatch(key, candidate);

  return {
    source: "google-shopping",
    sellerName: item.source ?? null,
    listedTitle: item.title ?? "",
    price: typeof item.extracted_price === "number" ? item.extracted_price : null,
    currency: "USD",
    shipping: parseDelivery(item.delivery),
    condition: item.second_hand_condition ?? "New",
    url: item.product_link ?? item.link ?? "",
    availability: "unknown",
    matchConfidence: match.confidence,
    matchTier: match.tier,
    matchReason: match.reason,
  };
}

/**
 * Build the meta-search query. Spike finding: querying Google Shopping by a raw
 * UPC returns unrelated products (Google keyword-matches the digits — we saw
 * facial tissues and Pokémon cards come back for real barcodes), while
 * "artist title vinyl LP" returns clean vinyl offers. So this is text-first.
 * (UPC-as-query stays the right move for GTIN-native APIs like eBay — that's a
 * per-adapter decision, not a global one.)
 */
export function buildQuery(key: ReleaseKey): string {
  return `${key.artist} ${key.title} vinyl LP`.replace(/\s+/g, " ").trim();
}

export interface SearchOptions {
  /** Drop offers below this confidence. Default keeps "possible"+ (0.5). */
  minConfidence?: number;
  /** Override the API key (else reads SERPAPI_KEY). */
  apiKey?: string;
  signal?: AbortSignal;
}

/**
 * Live meta-search. Requires a SerpApi key — without one it throws a clear
 * error rather than silently returning nothing, so the spike's live
 * match-quality run fails loudly if the key is missing.
 */
export async function searchGoogleShopping(
  key: ReleaseKey,
  opts: SearchOptions = {},
): Promise<Offer[]> {
  const apiKey = opts.apiKey ?? process.env.SERPAPI_KEY;
  if (!apiKey) {
    throw new Error(
      "SERPAPI_KEY not set — live Google Shopping match-quality test needs a SerpApi key.",
    );
  }

  const minConfidence = opts.minConfidence ?? 0.5;
  const params = new URLSearchParams({
    engine: "google_shopping",
    q: buildQuery(key),
    gl: "us",
    hl: "en",
    api_key: apiKey,
  });

  const res = await fetch(`https://serpapi.com/search?${params}`, {
    signal: opts.signal,
  });
  if (!res.ok) {
    throw new Error(`SerpApi request failed: ${res.status}`);
  }
  const data = (await res.json()) as { shopping_results?: SerpShoppingItem[] };

  return (data.shopping_results ?? [])
    .map((item) => serpItemToOffer(item, key))
    .filter((offer) => offer.matchConfidence >= minConfidence)
    .sort((a, b) => {
      // Rank by match tier first, then by landed cost (price + shipping).
      if (b.matchConfidence !== a.matchConfidence) {
        return classifyRank(b) - classifyRank(a);
      }
      return landedCost(a) - landedCost(b);
    });
}

function landedCost(o: Offer): number {
  return (o.price ?? Infinity) + (o.shipping ?? 0);
}

function classifyRank(o: Offer): number {
  return { verified: 3, likely: 2, possible: 1, rejected: 0 }[
    classifyTier(o.matchConfidence)
  ];
}
