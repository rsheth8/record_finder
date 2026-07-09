/**
 * Shopify local-shop adapter — the seed of the "local record store" flywheel.
 *
 * Every Shopify storefront exposes its full catalog at a public, no-auth
 * `/products.json` endpoint (used by Shopify's own theme JS), so a shop's live
 * inventory can be searched with zero API keys and zero per-shop integration
 * work. The catch: this is the *public* JSON (not the authenticated Admin
 * API) — verified live against a real store (turntablelab.com) — and it does
 * **not** include a `barcode` field, so Shopify offers can only ever be
 * fuzzy-matched by title, the same confidence ceiling as Google Shopping.
 *
 * Foundation only: shops are registered by hand via `addLocalShop` in
 * `db/queries.ts` (no public self-serve "claim your shop" form/verification
 * flow yet — that's real product surface: auth, ownership proof, moderation).
 * There's also no per-shop catalog cache/index yet, so this fetches a shop's
 * first page of products live on every offer request; fine for a handful of
 * registered shops, but a periodic sync job (mirroring the price-snapshot
 * cron) is the right next step once there are more than a few.
 */

import { scoreMatch } from "./match";
import type { Offer, OfferCandidate, ReleaseKey } from "./types";

export interface ShopifyVariant {
  id?: number;
  title?: string;
  price?: string;
  available?: boolean;
}

export interface ShopifyProduct {
  id?: number;
  title?: string;
  handle?: string;
  vendor?: string;
  variants?: ShopifyVariant[];
}

export interface LocalShopInfo {
  name: string;
  /** Storefront domain, e.g. "turntablelab.com" or "my-shop.myshopify.com". */
  domain: string;
}

const PRODUCTS_PER_PAGE = 250; // Shopify's own max per page for this endpoint.
const FETCH_TIMEOUT_MS = 8000;

function toStorefrontUrl(domain: string): string {
  const bare = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${bare}/products.json?limit=${PRODUCTS_PER_PAGE}`;
}

/** Fetch a shop's first page of products. Returns [] on any failure (down,
 * not actually Shopify, geofenced, ...) rather than throwing — one shop being
 * unreachable should never be treated differently than "no matches there". */
export async function fetchShopifyProducts(
  domain: string,
  opts: { signal?: AbortSignal } = {},
): Promise<ShopifyProduct[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const signal = opts.signal
      ? AbortSignal.any([opts.signal, controller.signal])
      : controller.signal;

    const res = await fetch(toStorefrontUrl(domain), { signal });
    clearTimeout(timeout);
    if (!res.ok) return [];

    const data = (await res.json()) as { products?: ShopifyProduct[] };
    return data.products ?? [];
  } catch {
    return [];
  }
}

/** Cheapest available variant on a product, or null if none are in stock. */
function cheapestAvailableVariant(product: ShopifyProduct): ShopifyVariant | null {
  const available = (product.variants ?? []).filter((v) => v.available && v.price != null);
  if (available.length === 0) return null;
  return available.reduce((min, v) => (parseFloat(v.price!) < parseFloat(min.price!) ? v : min));
}

/**
 * Pure: score one Shopify product against the target release and map it to
 * an Offer, or null if it's out of stock. No barcode on the public feed (see
 * module docblock), so this always fuzzy-scores — never "verified".
 */
export function shopifyProductToOffer(
  product: ShopifyProduct,
  shop: LocalShopInfo,
  key: ReleaseKey,
): Offer | null {
  const variant = cheapestAvailableVariant(product);
  if (!variant) return null;

  const candidate: OfferCandidate = { title: product.title ?? "" };
  const match = scoreMatch(key, candidate);

  return {
    source: "shopify",
    sellerName: shop.name,
    listedTitle: product.title ?? "",
    price: parseFloat(variant.price!),
    currency: "USD",
    shipping: null,
    condition: null,
    url: `https://${shop.domain.replace(/^https?:\/\//, "")}/products/${product.handle}`,
    availability: "in_stock",
    matchConfidence: match.confidence,
    matchTier: match.tier,
    matchReason: match.reason,
  };
}

export interface ShopifySearchOptions {
  minConfidence?: number;
  signal?: AbortSignal;
}

/** Search one shop's catalog for offers matching `key`. */
export async function searchShopifyShop(
  shop: LocalShopInfo,
  key: ReleaseKey,
  opts: ShopifySearchOptions = {},
): Promise<Offer[]> {
  const minConfidence = opts.minConfidence ?? 0.5;
  const products = await fetchShopifyProducts(shop.domain, { signal: opts.signal });

  return products
    .map((p) => shopifyProductToOffer(p, shop, key))
    .filter((o): o is Offer => o != null && o.matchConfidence >= minConfidence);
}

/** Search every registered shop in parallel and flatten the results. One
 * shop failing (network error, no matches) never affects the others. */
export async function searchAllShopifyShops(
  shops: LocalShopInfo[],
  key: ReleaseKey,
  opts: ShopifySearchOptions = {},
): Promise<Offer[]> {
  const results = await Promise.all(shops.map((shop) => searchShopifyShop(shop, key, opts)));
  return results.flat();
}
