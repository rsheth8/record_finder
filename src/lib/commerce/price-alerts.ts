import type { WishlistAlertCandidate } from "@/lib/db/queries";

// A drop must clear this threshold to alert — avoids emailing over routine
// listing-to-listing noise (a single new cheaper copy showing up isn't
// necessarily "the price dropped").
export const PRICE_DROP_THRESHOLD = 0.1;

export interface PriceDropAlert {
  wishlistItemId: number;
  userId: string;
  email: string;
  discogsReleaseId: number;
  title: string;
  artist: string;
  oldPrice: number;
  newPrice: number;
}

/** Pure filter over raw wishlist price data — no DB, no email client — so the
 * "who gets alerted and why" logic is unit-testable on its own. The baseline
 * for "did it drop" is `lastAlertedPrice ?? priceAtAdd`: once a user has been
 * alerted at a price, only a *further* drop below that re-triggers, so a
 * price that stays low isn't re-alerted every day. */
export function findPriceDropAlerts(
  candidates: WishlistAlertCandidate[],
): PriceDropAlert[] {
  const alerts: PriceDropAlert[] = [];

  for (const c of candidates) {
    if (!c.email || c.latestPrice == null) continue;
    const baseline = c.lastAlertedPrice ?? c.priceAtAdd;
    if (baseline == null) continue;

    const dropped = c.latestPrice <= baseline * (1 - PRICE_DROP_THRESHOLD);
    if (!dropped) continue;

    alerts.push({
      wishlistItemId: c.wishlistItemId,
      userId: c.userId,
      email: c.email,
      discogsReleaseId: c.discogsReleaseId,
      title: c.title,
      artist: c.artist,
      oldPrice: baseline,
      newPrice: c.latestPrice,
    });
  }

  return alerts;
}

/** Groups alerts by user so the cron job sends one email per user, not one
 * per dropped item. */
export function groupAlertsByUser(
  alerts: PriceDropAlert[],
): Map<string, PriceDropAlert[]> {
  const byUser = new Map<string, PriceDropAlert[]>();
  for (const alert of alerts) {
    const list = byUser.get(alert.userId) ?? [];
    list.push(alert);
    byUser.set(alert.userId, list);
  }
  return byUser;
}
