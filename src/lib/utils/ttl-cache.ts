/** Simple TTL cache with in-flight de-duplication: concurrent callers asking
 * for the same key while a fetch is already pending share that one promise
 * instead of each triggering their own. `shouldCache` lets a caller skip
 * caching outcomes that represent a failure (e.g. a `null` result from a
 * try/catch-wrapped API call) so a transient error doesn't get locked in for
 * the full TTL — the next call just retries instead. */
export function createTtlCache<K, V>(
  ttlMs: number,
  options: { shouldCache?: (value: V) => boolean } = {},
) {
  const shouldCache = options.shouldCache ?? (() => true);
  const store = new Map<K, { value: V; expiresAt: number }>();
  const inFlight = new Map<K, Promise<V>>();

  async function get(key: K, fetcher: () => Promise<V>): Promise<V> {
    const cached = store.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const pending = inFlight.get(key);
    if (pending) return pending;

    const promise = fetcher()
      .then((value) => {
        if (shouldCache(value)) {
          store.set(key, { value, expiresAt: Date.now() + ttlMs });
        }
        return value;
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, promise);
    return promise;
  }

  return { get };
}
