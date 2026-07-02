// Credits are a free gamification/rate-limit mechanic, not real currency —
// there is no payment path. These conversions only produce a display
// estimate of what a reservation "costs" relative to the Discogs listing
// price; no money changes hands anywhere in this flow.
const MIN_CREDITS = 50;
const CREDITS_PER_USD = 10;

export function usdToCredits(usd: number): number {
  const amount = typeof usd === "number" && Number.isFinite(usd) ? usd : 0;
  if (amount <= 0) return MIN_CREDITS;
  return Math.max(MIN_CREDITS, Math.ceil(amount * CREDITS_PER_USD));
}

export function creditsToUsd(credits: number): number {
  return credits / CREDITS_PER_USD;
}

export function formatCredits(credits: number): string {
  return `${credits.toLocaleString()} credits`;
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}
