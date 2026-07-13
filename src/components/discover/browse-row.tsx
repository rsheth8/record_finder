"use client";

import { useEffect, useRef, useState } from "react";
import { CarouselRow } from "@/components/discover/carousel-row";
import { RowSkeleton } from "@/components/discover/row-skeleton";
import type { BrowseRowDef } from "@/lib/recommendations/browse-rows";
import type { Recommendation, SearchPagination } from "@/lib/types";

function buildUrl(def: BrowseRowDef, page: number) {
  const params = new URLSearchParams({ page: String(page) });
  if (def.genre) params.set("genre", def.genre);
  if (def.decade) params.set("decade", def.decade);
  if (def.sort) params.set("sort", def.sort);
  return `/api/discogs/search?${params.toString()}`;
}

/** How many newly-arrived items to request price/rating/fair-value for at
 * once — roughly what's visible in a carousel viewport, not the whole page.
 * Smaller than Search's equivalent (12) since a row only ever shows ~5-6
 * cards at a time, so there's no benefit enriching further ahead than that;
 * the rest enrich once scrolled into view via the same mechanism. */
const ENRICH_BATCH_SIZE = 8;

/** A live-catalog Discover row — unlike the scored rows built from the
 * cached recommendation batch, this fetches its own page(s) directly from
 * `/api/discogs/search` (genre/decade/sort filters, no text query), so it
 * isn't bounded by how big that batch is. The parent (`DiscoverFeed`) keys
 * this by `def.id`, so a given row's identity — and its fetch state — never
 * changes for the lifetime of the component; only the *query* it fetches on
 * mount is fixed to `def`. `CarouselRow` calls back into this when the user
 * scrolls it to the end. Renders nothing if the first page comes back too
 * thin to be worth a row — the parent's scroll sentinel naturally keeps
 * advancing since a null row takes no scroll height.
 *
 * The list itself and its price/rating badges load in two separate phases:
 * `/api/discogs/search` returns fast (one Discogs call, no enrichment) so
 * covers/titles/artists show up almost immediately, then a background
 * `POST /api/discogs/enrich` call for just the first `ENRICH_BATCH_SIZE`
 * items fills in price/rating/fair-value a beat later. */
export function BrowseRow({ def, rowIndex }: { def: BrowseRowDef; rowIndex: number }) {
  const [items, setItems] = useState<Recommendation[]>([]);
  const [pagination, setPagination] = useState<SearchPagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tooThin, setTooThin] = useState(false);
  // Bookkeeping only ever read/written from callbacks (loadMore, the fetch
  // effect), never during render — safe as plain refs.
  const fetchedPages = useRef(new Set<number>());
  const mounted = useRef(true);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  async function enrichItems(toEnrich: Recommendation[]) {
    if (toEnrich.length === 0) return;
    try {
      const res = await fetch("/api/discogs/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: toEnrich }),
      });
      if (!res.ok || !mounted.current) return;
      const data = await res.json();
      if (!mounted.current) return;
      const enrichedById = new Map(
        (data.results as Recommendation[]).map((r) => [r.discogsReleaseId, r]),
      );
      setItems((prev) =>
        prev.map((item) => enrichedById.get(item.discogsReleaseId) ?? item),
      );
    } catch {
      // Best-effort — cards just stay without a price badge, same as any
      // item beyond ENRICH_BATCH_SIZE that never gets requested.
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(buildUrl(def, 1));
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.results?.length || data.results.length < 3) {
          setTooThin(true);
          return;
        }
        fetchedPages.current.add(1);
        setItems(data.results);
        setPagination(data.pagination ?? null);
        void enrichItems((data.results as Recommendation[]).slice(0, ENRICH_BATCH_SIZE));
      } catch {
        if (!cancelled) setTooThin(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `def` is fixed for the lifetime of this component — the parent keys
    // each BrowseRow by `def.id`, so a genuinely different row means a fresh
    // mount (and fresh initial state), not a re-run of this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMore() {
    if (!pagination) return;
    const page = pagination.page + 1;
    if (page > pagination.pages || fetchedPages.current.has(page)) return;

    fetchedPages.current.add(page);
    setLoadingMore(true);
    try {
      const res = await fetch(buildUrl(def, page));
      const data = await res.json();
      if (!res.ok || !data.results?.length) return;

      const seen = new Set(items.map((r) => r.discogsReleaseId));
      const additions = (data.results as Recommendation[]).filter(
        (r) => !seen.has(r.discogsReleaseId),
      );
      setItems((prev) => [...prev, ...additions]);
      setPagination(data.pagination ?? pagination);
      void enrichItems(additions.slice(0, ENRICH_BATCH_SIZE));
    } finally {
      setLoadingMore(false);
    }
  }

  if (tooThin) return null;
  if (loading) return <RowSkeleton />;

  const hasMore = pagination ? pagination.page < pagination.pages : false;

  return (
    <CarouselRow
      title={def.title}
      items={items}
      rowIndex={rowIndex}
      onLoadMore={loadMore}
      hasMore={hasMore}
      loadingMore={loadingMore}
    />
  );
}
