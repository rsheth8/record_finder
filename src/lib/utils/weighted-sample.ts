/** Weighted random sample of `k` items from `items`, without replacement, via
 * the A-Res algorithm (Efraimidis & Spirakis): each item gets a key
 * `u ** (1 / weight)` for a fresh random `u`, and the top-k keys win. Higher
 * weight biases selection without making it deterministic — heavier items are
 * *more likely*, not guaranteed, to appear. `rng` is injectable for tests. */
export function weightedSample<T>(
  items: T[],
  k: number,
  weightOf: (item: T) => number,
  rng: () => number = Math.random,
): T[] {
  if (k >= items.length) return [...items];

  const keyed = items.map((item) => {
    const weight = Math.max(1e-9, weightOf(item));
    const u = Math.min(1 - 1e-9, Math.max(1e-9, rng()));
    return { item, key: Math.pow(u, 1 / weight) };
  });

  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, k).map((k) => k.item);
}
