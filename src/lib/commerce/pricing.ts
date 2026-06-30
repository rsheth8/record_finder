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
