const USD = "USD";

type RatesCache = {
  fetchedAt: number;
  /** How many units of each currency equal 1 USD (e.g. EUR: 0.92). */
  perUsd: Record<string, number>;
};

let ratesCache: RatesCache | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function getRatesPerUsd(): Promise<Record<string, number>> {
  const now = Date.now();
  if (ratesCache && now - ratesCache.fetchedAt < CACHE_TTL_MS) {
    return ratesCache.perUsd;
  }

  const res = await fetch("https://api.frankfurter.app/latest?from=USD", {
    next: { revalidate: 86400 },
  });
  if (!res.ok) {
    throw new Error(`FX rate fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as { rates: Record<string, number> };
  ratesCache = { fetchedAt: now, perUsd: data.rates };
  return data.rates;
}

/** Convert a Discogs listing price to USD for display and credit math. */
export async function convertToUsd(
  amount: number,
  currency: string,
): Promise<number> {
  if (!Number.isFinite(amount)) return 0;

  const from = currency.trim().toUpperCase();
  if (!from || from === USD) return amount;

  try {
    const perUsd = await getRatesPerUsd();
    const rate = perUsd[from];
    if (!rate || !Number.isFinite(rate)) return amount;
    return amount / rate;
  } catch {
    return amount;
  }
}

export function roundUsd(amount: number): number {
  return Math.round(amount * 100) / 100;
}
