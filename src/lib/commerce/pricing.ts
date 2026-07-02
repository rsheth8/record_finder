// Credits are a free gamification/rate-limit mechanic, not real currency —
// there is no payment path. These conversions only produce a display
// estimate of what a reservation "costs" relative to the Discogs listing
// price; no money changes hands anywhere in this flow.
const MIN_CREDITS = 50;
const CREDITS_PER_USD = 10;

export function usdToCredits(usd: number): number {
  if (!usd || usd <= 0) return MIN_CREDITS;
  return Math.max(MIN_CREDITS, Math.ceil(usd * CREDITS_PER_USD));
}

export function creditsToUsd(credits: number): number {
  return credits / CREDITS_PER_USD;
}

export function formatCredits(credits: number): string {
  return `${credits.toLocaleString()} credits`;
}

export function formatUsd(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}
