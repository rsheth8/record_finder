/**
 * Multi-source "where to buy" layer (SPIKE).
 *
 * A normalized `Offer` is one purchasable listing of a record from any source
 * (Discogs marketplace, Google Shopping meta-search, eBay, a local shop's
 * Shopify feed, ...). Every adapter maps its raw response into this shape so
 * the album page can rank offers cheapest-first across all sources.
 *
 * This file is the foundation the real build would grow from; for the spike we
 * only exercise the matching/confidence half (match.ts) plus a key-ready Google
 * Shopping adapter (google-shopping.ts).
 */

export type OfferSource = "discogs" | "google-shopping" | "ebay" | "shopify" | "walmart";

export type Availability = "in_stock" | "out_of_stock" | "unknown";

/** How sure we are this offer is the *same record* as the Discogs release. */
export type MatchTier = "verified" | "likely" | "possible" | "rejected";

export interface Offer {
  source: OfferSource;
  sellerName: string | null;
  /** Title exactly as the source listed it (kept for debugging match quality). */
  listedTitle: string;
  /** Item price in `currency`, excluding shipping. Null if the source hides it. */
  price: number | null;
  currency: string;
  /** Shipping to the buyer, when the source exposes it. Null = unknown. */
  shipping: number | null;
  condition: string | null;
  url: string;
  availability: Availability;
  /** 0..1 confidence this offer matches the target release. */
  matchConfidence: number;
  matchTier: MatchTier;
  matchReason: string;
}

/**
 * The normalized identity of the record we're shopping for, derived from a
 * Discogs release. `upcs` are canonical GTIN-13 strings (see match.ts).
 */
export interface ReleaseKey {
  artist: string;
  title: string;
  year: number | null;
  /** Human format summary, e.g. "Vinyl, LP, Album". Used as a format signal. */
  format: string;
  upcs: string[];
}

/** A candidate offer from an external source, pre-normalization. */
export interface OfferCandidate {
  title: string;
  /** Barcode/UPC/GTIN the source reported for the product, if any. */
  upc?: string | null;
  /** Free-text format/condition hint if the source exposes one. */
  formatHint?: string | null;
}

export interface MatchResult {
  confidence: number;
  tier: MatchTier;
  reason: string;
}
