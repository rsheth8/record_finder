/**
 * Discogs marketplace adapter for the multi-source offer layer.
 *
 * Discogs' API only exposes the *aggregate* lowest price + listing count for a
 * release (not per-seller rows), so this yields a single "cheapest on Discogs"
 * offer — but a **verified** one, since it's keyed to this exact release rather
 * than fuzzy-matched. `getRelease()` already embeds `release.marketplace`, so
 * building this offer costs zero extra Discogs calls.
 */

import type { DiscogsRelease } from "@/lib/types";
import { extractUpcs } from "./match";
import type { Offer, ReleaseKey } from "./types";

/** Normalize a Discogs release into the identity we shop for across sources. */
export function buildReleaseKey(release: DiscogsRelease): ReleaseKey {
  return {
    artist: release.artist,
    title: release.title,
    year: release.year ?? null,
    format: release.formats.join(", "),
    upcs: extractUpcs(release.identifiers),
  };
}

/**
 * The Discogs marketplace offer for a release, or null when nothing is for
 * sale. Confidence is always 1.0 / verified — this is the exact release.
 */
export function discogsOffer(release: DiscogsRelease): Offer | null {
  const m = release.marketplace;
  if (!m || m.numForSale <= 0) return null;

  return {
    source: "discogs",
    sellerName: "Discogs Marketplace",
    listedTitle: `${release.artist} — ${release.title}`,
    price: m.lowestPrice,
    currency: m.currency || "USD",
    // Discogs' stats endpoint doesn't expose shipping; it varies per seller.
    shipping: null,
    condition: null,
    url: m.discogsUrl,
    availability: "in_stock",
    matchConfidence: 1,
    matchTier: "verified",
    matchReason: `${m.numForSale} listing${m.numForSale === 1 ? "" : "s"} on Discogs`,
  };
}
