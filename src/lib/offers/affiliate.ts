/**
 * Outbound affiliate tagging for the offer panel.
 *
 * eBay is handled at the source: `searchEbay` sends `EBAY_CAMPAIGN_ID` via the
 * `X-EBAY-C-ENDUSERCTX` header, so the Browse API itself returns an
 * affiliate-tagged `itemAffiliateWebUrl` (see ebay.ts) — nothing to rewrite here.
 *
 * Google Shopping offers point at arbitrary retailers (Walmart, Barnes &
 * Noble, countless indie shops) that we have no individual affiliate deal
 * with. Skimlinks auto-affiliates ~48,500 merchants through one integration —
 * no per-merchant signup — by rewriting the outbound link through their
 * redirect, which resolves the destination and applies whatever affiliate
 * relationship it has for that merchant. Docs:
 * https://developers.skimlinks.com/link.html
 */

import type { Offer } from "./types";

export interface AffiliateConfig {
  skimlinksPublisherId?: string;
}

export function readAffiliateConfig(): AffiliateConfig {
  return { skimlinksPublisherId: process.env.SKIMLINKS_PUBLISHER_ID };
}

/**
 * Wrap a destination URL in Skimlinks' redirect. `xcust` is Skimlinks' free-text
 * tracking slot (<=50 chars, alphanumeric/underscore/pipe) — we pass the offer
 * source so click-through reporting can be split by source later.
 */
export function wrapWithSkimlinks(url: string, publisherId: string, xcust?: string): string {
  const params = new URLSearchParams({ id: publisherId, xs: "1", url });
  if (xcust) params.set("xcust", xcust.replace(/[^A-Za-z0-9_|]/g, "").slice(0, 50));
  return `https://go.skimresources.com/?${params.toString()}`;
}

/** Pure: apply the right tagging strategy for one offer's source. */
export function applyAffiliateTag(offer: Offer, config: AffiliateConfig): Offer {
  if (!offer.url) return offer;

  // eBay already carries an EPN-tagged URL when EBAY_CAMPAIGN_ID is set (see
  // module docblock); Discogs has no wired affiliate program yet — both
  // pass through untouched.
  if (offer.source === "ebay" || offer.source === "discogs") return offer;

  if (!config.skimlinksPublisherId) return offer;
  return {
    ...offer,
    url: wrapWithSkimlinks(offer.url, config.skimlinksPublisherId, offer.source),
  };
}

/** Apply affiliate tagging to a whole ranked offer list. */
export function applyAffiliateTags(
  offers: Offer[],
  config: AffiliateConfig = readAffiliateConfig(),
): Offer[] {
  return offers.map((o) => applyAffiliateTag(o, config));
}

/**
 * True when at least one offer in the (already-tagged) list is a genuine
 * affiliate link. Ground-truth check on the actual URLs rather than on config
 * presence, so the UI's disclosure line is never shown when nothing was
 * actually tagged (e.g. Skimlinks configured but every offer happened to be
 * Discogs/eBay-without-campaign this render).
 */
export function hasAffiliateLink(offers: Offer[]): boolean {
  return offers.some(
    (o) =>
      o.url.includes("go.skimresources.com") ||
      (o.source === "ebay" && o.url.includes("campid=")),
  );
}
