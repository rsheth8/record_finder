import type { Recommendation } from "@/lib/types";

/** Quartile cutoffs for the "good value" flag: a pick needs to be in the top
 * quartile of demand and the bottom quartile of price within its batch. */
const DEMAND_TOP_QUARTILE = 0.75;
const PRICE_BOTTOM_QUARTILE = 0.25;

/** 0-indexed rank (0 = smallest) of each value within the array, as a
 * fraction in [0, 1]. Ties share the same rank. A single-element or
 * all-equal array ranks everything at 1 (nothing to be relatively better
 * than) so a flat batch never spuriously flags every pick. */
function percentileRanks(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const rankOf = new Map<number, number>();
  sorted.forEach((v, i) => {
    if (!rankOf.has(v)) rankOf.set(v, i);
  });
  const span = values.length - 1;
  return values.map((v) => (span > 0 ? rankOf.get(v)! / span : 1));
}

/** Flags picks that are unusually good value *relative to the rest of this
 * batch*: top-quartile demand (want/have ratio — how chased a pressing is per
 * copy actually in circulation, a stronger "worth grabbing" signal than raw
 * want count alone) combined with bottom-quartile price. This is intentionally
 * batch-relative, not an absolute market-fair-price model — Discogs doesn't
 * expose sold-price history, only current listings, so there's no honest way
 * to claim "underpriced vs. the real market" without collecting price history
 * over time (a separate, larger feature). Picks without a known price are
 * never flagged — no data, no claim. */
export function computeFairValue(recs: Recommendation[]): Map<number, boolean> {
  const priced = recs.filter(
    (r) => r.marketplace?.lowestPrice != null && r.marketplace.numForSale > 0,
  );

  const demandRatios = priced.map(
    (r) => (r.wantCount ?? 0) / Math.max(1, r.haveCount ?? 0),
  );
  const prices = priced.map((r) => r.marketplace!.lowestPrice!);

  const demandRanks = percentileRanks(demandRatios);
  const priceRanks = percentileRanks(prices);

  const flagged = new Map<number, boolean>();
  priced.forEach((r, i) => {
    const isGoodValue =
      demandRanks[i] >= DEMAND_TOP_QUARTILE && priceRanks[i] <= PRICE_BOTTOM_QUARTILE;
    flagged.set(r.discogsReleaseId, isGoodValue);
  });

  return flagged;
}
