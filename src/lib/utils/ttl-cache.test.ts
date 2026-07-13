import { describe, it, expect, vi } from "vitest";
import { createTtlCache } from "@/lib/utils/ttl-cache";

describe("createTtlCache", () => {
  it("returns the cached value without calling the fetcher again", async () => {
    const cache = createTtlCache<string, number>(60_000);
    const fetcher = vi.fn().mockResolvedValue(42);

    expect(await cache.get("a", fetcher)).toBe(42);
    expect(await cache.get("a", fetcher)).toBe(42);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetches once the TTL has expired", async () => {
    vi.useFakeTimers();
    try {
      const cache = createTtlCache<string, number>(1000);
      const fetcher = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

      expect(await cache.get("a", fetcher)).toBe(1);
      vi.advanceTimersByTime(1001);
      expect(await cache.get("a", fetcher)).toBe(2);
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("de-dupes concurrent callers for the same key into one in-flight fetch", async () => {
    const cache = createTtlCache<string, number>(60_000);
    let resolveFetch!: (value: number) => void;
    const fetcher = vi.fn(
      () => new Promise<number>((resolve) => (resolveFetch = resolve)),
    );

    const p1 = cache.get("a", fetcher);
    const p2 = cache.get("a", fetcher);
    resolveFetch(7);

    expect(await p1).toBe(7);
    expect(await p2).toBe(7);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps separate entries per key", async () => {
    const cache = createTtlCache<string, number>(60_000);
    const fetcher = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    expect(await cache.get("a", fetcher)).toBe(1);
    expect(await cache.get("b", fetcher)).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not cache a value that shouldCache rejects, so the next call retries", async () => {
    const cache = createTtlCache<string, number | null>(60_000, {
      shouldCache: (v) => v !== null,
    });
    const fetcher = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(5);

    expect(await cache.get("a", fetcher)).toBeNull();
    expect(await cache.get("a", fetcher)).toBe(5);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
