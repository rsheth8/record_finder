/** Spaces out calls through a shared throttle so callers can be issued concurrently
 * while still respecting a target API's real per-second rate limit. */
export function createRateLimiter(minIntervalMs: number) {
  let nextAvailable = 0;

  return async function throttle<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const wait = Math.max(0, nextAvailable - now);
    nextAvailable = Math.max(now, nextAvailable) + minIntervalMs;
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    return fn();
  };
}

/** Runs `fn` over `items` with up to `concurrency` workers in flight at once. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );

  return results;
}
