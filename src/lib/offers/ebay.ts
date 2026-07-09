/**
 * eBay Browse API adapter.
 *
 * Unlike Google Shopping (list items never expose a UPC to verify against, so
 * everything caps at "likely"), eBay's Browse API supports searching **by
 * GTIN directly** (`?gtin=...`) — eBay's own catalog does the barcode match,
 * not our fuzzy scorer, so a GTIN-search hit is a genuine **verified** offer.
 * When the release has no UPC (pre-barcode originals), we fall back to the
 * same text query + fuzzy scoring as Google Shopping.
 *
 * Auth: OAuth2 client-credentials (no user login) — a server-to-server app
 * token scoped to public browse access, cached in-process until it expires.
 * Docs: https://developer.ebay.com/api-docs/buy/browse/overview.html
 */

import { normalizeGtin, scoreMatch } from "./match";
import type { Offer, OfferCandidate, ReleaseKey } from "./types";

const OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const SCOPE = "https://api.ebay.com/oauth/api_scope";

export interface EbayCredentials {
  clientId: string;
  clientSecret: string;
}

function readCredentials(): EbayCredentials | null {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

// Module-scoped token cache — one server-to-server app token shared across
// requests until it expires (eBay tokens last ~2h), same spirit as
// discogsThrottle being a shared, process-level resource.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(creds: EbayCredentials): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }

  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE }),
  });

  if (!res.ok) {
    throw new Error(`eBay OAuth failed: ${res.status}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.value;
}

/** Minimal shape of one Browse API `itemSummaries` entry we rely on. */
export interface EbayItemSummary {
  itemId?: string;
  title?: string;
  itemWebUrl?: string;
  itemAffiliateWebUrl?: string;
  price?: { value?: string; currency?: string };
  condition?: string;
  seller?: { username?: string };
  shippingOptions?: { shippingCost?: { value?: string } }[];
  itemLocation?: { country?: string };
}

function firstShippingCost(item: EbayItemSummary): number | null {
  const opt = item.shippingOptions?.[0]?.shippingCost?.value;
  return opt != null ? parseFloat(opt) : null;
}

/**
 * Pure: map one eBay item into a scored Offer.
 * `verifiedByGtin` — true when this item came back from a GTIN-filtered
 * search, i.e. eBay's own catalog (not our fuzzy scorer) confirmed the match.
 */
export function ebayItemToOffer(
  item: EbayItemSummary,
  key: ReleaseKey,
  verifiedByGtin: boolean,
): Offer {
  const candidate: OfferCandidate = { title: item.title ?? "" };
  const match = verifiedByGtin
    ? { confidence: 1, tier: "verified" as const, reason: "eBay catalog GTIN match" }
    : scoreMatch(key, candidate);

  return {
    source: "ebay",
    sellerName: item.seller?.username ?? "eBay seller",
    listedTitle: item.title ?? "",
    price: item.price?.value != null ? parseFloat(item.price.value) : null,
    currency: item.price?.currency ?? "USD",
    shipping: firstShippingCost(item),
    condition: item.condition ?? null,
    // Prefer the affiliate-tagged URL — the Browse API includes
    // itemAffiliateWebUrl automatically once EBAY_CAMPAIGN_ID is sent via the
    // X-EBAY-C-ENDUSERCTX header on the search request (see buildEndUserCtx).
    url: item.itemAffiliateWebUrl || item.itemWebUrl || "",
    availability: "in_stock",
    matchConfidence: match.confidence,
    matchTier: match.tier,
    matchReason: match.reason,
  };
}

export interface EbaySearchOptions {
  minConfidence?: number;
  credentials?: EbayCredentials;
  /** eBay Partner Network campaign ID (10-digit "campid"). When set, Browse
   * API responses include an affiliate-tagged `itemAffiliateWebUrl` on each
   * item — no separate link-rewriting step needed for eBay. */
  campaignId?: string;
  signal?: AbortSignal;
}

/** Builds the X-EBAY-C-ENDUSERCTX header value that turns on affiliate
 * tracking for this request. https://developer.ebay.com/api-docs/buy/static/api-browse.html */
export function buildEndUserCtx(campaignId: string, referenceId?: string): string {
  const parts = [`affiliateCampaignId=${campaignId}`];
  if (referenceId) parts.push(`affiliateReferenceId=${referenceId}`);
  return parts.join(",");
}

async function runSearch(
  token: string,
  params: URLSearchParams,
  campaignId: string | undefined,
  signal?: AbortSignal,
): Promise<EbayItemSummary[]> {
  const headers: HeadersInit = {
    Authorization: `Bearer ${token}`,
    "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
  };
  if (campaignId) headers["X-EBAY-C-ENDUSERCTX"] = buildEndUserCtx(campaignId);

  const res = await fetch(`${BROWSE_URL}?${params}`, { headers, signal });
  if (!res.ok) {
    throw new Error(`eBay Browse search failed: ${res.status}`);
  }
  const data = (await res.json()) as { itemSummaries?: EbayItemSummary[] };
  return data.itemSummaries ?? [];
}

/**
 * Live eBay Browse search. Requires `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET` —
 * throws a clear error without them so a misconfigured live run fails loudly
 * rather than silently returning nothing (the orchestrator catches this and
 * just skips the source, so app users never see it).
 */
export async function searchEbay(
  key: ReleaseKey,
  opts: EbaySearchOptions = {},
): Promise<Offer[]> {
  const creds = opts.credentials ?? readCredentials();
  if (!creds) {
    throw new Error(
      "EBAY_CLIENT_ID/EBAY_CLIENT_SECRET not set — eBay adapter needs eBay Developer credentials.",
    );
  }

  const minConfidence = opts.minConfidence ?? 0.5;
  const campaignId = opts.campaignId ?? process.env.EBAY_CAMPAIGN_ID;
  const token = await getAccessToken(creds);

  let items: EbayItemSummary[] = [];
  let verifiedByGtin = false;

  const upc = key.upcs[0] ? normalizeGtin(key.upcs[0]) : null;
  if (upc) {
    // eBay's catalog does the barcode matching here — no fuzzy scoring needed.
    items = await runSearch(
      token,
      new URLSearchParams({ gtin: upc, limit: "20" }),
      campaignId,
      opts.signal,
    );
    verifiedByGtin = items.length > 0;
  }

  if (items.length === 0) {
    const q = `${key.artist} ${key.title} vinyl LP`.replace(/\s+/g, " ").trim();
    items = await runSearch(
      token,
      new URLSearchParams({ q, limit: "20" }),
      campaignId,
      opts.signal,
    );
    verifiedByGtin = false;
  }

  return items
    .map((item) => ebayItemToOffer(item, key, verifiedByGtin))
    .filter((offer) => offer.matchConfidence >= minConfidence)
    .sort((a, b) => {
      if (b.matchConfidence !== a.matchConfidence) {
        return b.matchConfidence - a.matchConfidence;
      }
      const la = (a.price ?? Infinity) + (a.shipping ?? 0);
      const lb = (b.price ?? Infinity) + (b.shipping ?? 0);
      return la - lb;
    });
}
