"use client";

import { useEffect, useRef, useState } from "react";
import { Disc3, Loader2, Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DiscoverGrid } from "@/components/discover/discover-grid";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import {
  SearchFilters,
  DEFAULT_SEARCH_FILTERS,
  type SearchFilterState,
} from "@/components/search/search-filters";
import { BLEED_MX, BLEED_PX, FULL_BLEED } from "@/lib/layout";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/utils";
import type { Recommendation, SearchPagination } from "@/lib/types";

function IntroState() {
  return (
    <EmptyState
      icon={SearchIcon}
      shelf={false}
      title="Search any artist or album on vinyl"
      description="Real Discogs pressings, priced and rated — no quiz or sign-in required."
    />
  );
}

/** Fire-and-forget click-through beacon for the search → click → reservation
 * funnel — doesn't block or delay navigation, and a failure here is silently
 * dropped (this is instrumentation, not app behavior). */
function logSearchResultClick(rec: Recommendation) {
  const body = JSON.stringify({
    type: "search_result_click",
    metadata: { discogsReleaseId: rec.discogsReleaseId },
  });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/analytics/event",
      new Blob([body], { type: "application/json" }),
    );
    return;
  }
  fetch("/api/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function NoResultsState({ query }: { query: string }) {
  return (
    <EmptyState
      icon={Disc3}
      title="No vinyl found"
      description={
        <>
          Nothing on Discogs matched &ldquo;{query}&rdquo;. Try a different spelling
          or a shorter query.
        </>
      }
    />
  );
}

/** How many newly-arrived results to request price/rating/fair-value for at
 * once — roughly what's visible in the grid on a typical viewport. The rest
 * of a page still renders (title/artist/cover/year/genre/want-count are all
 * free from the fast, unenriched search response) just without a price
 * badge until scrolled into view triggers the next page anyway. */
const ENRICH_BATCH_SIZE = 12;

export function SearchFeed({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<Recommendation[]>([]);
  const [pagination, setPagination] = useState<SearchPagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [filters, setFilters] = useState<SearchFilterState>(DEFAULT_SEARCH_FILTERS);
  // Rapid filter changes (a few pill clicks in a row) each kick off a real
  // Discogs-backed request; without this, an earlier, slower request could
  // resolve after a later one and clobber the UI with stale results. Also
  // covers a scroll-triggered "load more" being superseded by a new search.
  const activeRequest = useRef<AbortController | null>(null);
  // Kept in sync with `results` alongside every setResults call below, so
  // the append-mode dedup logic in runSearch always reads the current list
  // rather than a value captured in a stale render's closure.
  const resultsRef = useRef<Recommendation[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Background follow-up to the fast, unenriched search response — patches
   * price/rating/fair-value into already-rendered cards by id once it
   * resolves. Not tied to `activeRequest`'s AbortController: if a newer
   * search supersedes this one before it resolves, the merge below is a
   * harmless no-op for any id that's no longer in `results`. */
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
      setResults((prev) => {
        const next = prev.map((item) => enrichedById.get(item.discogsReleaseId) ?? item);
        resultsRef.current = next;
        return next;
      });
    } catch {
      // Best-effort — cards just stay without a price badge.
    }
  }

  async function runSearch(
    q: string,
    targetPage: number,
    activeFilters: SearchFilterState,
    { append = false }: { append?: boolean } = {},
  ) {
    const trimmed = q.trim();
    if (!trimmed) return;

    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setResults([]);
      resultsRef.current = [];
      setPagination(null);
    }
    setError(null);
    setHasSearched(true);

    try {
      const params = new URLSearchParams({ q: trimmed, page: String(targetPage) });
      if (activeFilters.genre) params.set("genre", activeFilters.genre);
      if (activeFilters.decade) params.set("decade", activeFilters.decade);
      if (activeFilters.sort !== "relevance") params.set("sort", activeFilters.sort);

      const res = await fetch(`/api/discogs/search?${params.toString()}`, {
        signal: controller.signal,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Search failed");
        if (!append) setPagination(null);
        return;
      }

      const fetched = (data.results ?? []) as Recommendation[];
      const seen = append
        ? new Set(resultsRef.current.map((r) => r.discogsReleaseId))
        : new Set<number>();
      const additions = fetched.filter((r) => !seen.has(r.discogsReleaseId));
      const nextResults = append ? [...resultsRef.current, ...additions] : additions;

      resultsRef.current = nextResults;
      setResults(nextResults);
      setPagination(data.pagination ?? null);
      setPage(targetPage);
      void enrichItems(additions.slice(0, ENRICH_BATCH_SIZE));
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError("Something went wrong. Check your connection and try again.");
      if (!append) setPagination(null);
    } finally {
      if (activeRequest.current === controller) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }

  // Deep-linked queries (e.g. from Discover's "search all vinyl" bridge) run
  // automatically on mount instead of waiting for a manual submit.
  const autoTriggered = useRef(false);
  useEffect(() => {
    if (initialQuery.trim() && !autoTriggered.current) {
      autoTriggered.current = true;
      void runSearch(initialQuery, 1, DEFAULT_SEARCH_FILTERS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmittedQuery(query);
    void runSearch(query, 1, filters);
  }

  // Genre/decade/sort are real Discogs search params (see searchCatalog), so
  // changing them re-runs the search against the whole catalog rather than
  // filtering the current page — only meaningful once a query exists.
  function handleFiltersChange(next: SearchFilterState) {
    setFilters(next);
    if (submittedQuery.trim()) {
      void runSearch(submittedQuery, 1, next);
    }
  }

  function loadNextPage() {
    if (loading || loadingMore) return;
    if (!pagination || page >= pagination.pages) return;
    void runSearch(submittedQuery, page + 1, filters, { append: true });
  }

  const hasMorePages = !!pagination && page < pagination.pages;
  // Modest lookahead — see the matching note in DiscoverFeed on why a large
  // rootMargin combined with resetKey re-checks can cascade multiple pages
  // at once instead of pacing to the user's actual scroll position.
  const sentinelRef = useInView<HTMLDivElement>(loadNextPage, {
    rootMargin: "400px",
    resetKey: page,
  });

  return (
    <div className={cn(FULL_BLEED, "space-y-6")}>
      <form onSubmit={handleSubmit} className={cn(BLEED_PX, "flex gap-2")}>
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search artist or album..."
            className="pl-10"
          />
        </div>
        <Button type="submit" disabled={loading || !query.trim()}>
          Search
        </Button>
      </form>

      <div className={BLEED_PX}>
        <SearchFilters filters={filters} onChange={handleFiltersChange} />
      </div>

      {error && (
        <div className={cn(BLEED_MX, "rounded-lg border border-error/30 bg-error/10 p-4 text-sm text-error")}>
          {error}
        </div>
      )}

      {loading ? (
        <VinylLoader variant="section" context="search" />
      ) : !hasSearched ? (
        <Card className={BLEED_MX}>
          <IntroState />
        </Card>
      ) : results.length === 0 && !error ? (
        <Card className={BLEED_MX}>
          <NoResultsState query={submittedQuery} />
        </Card>
      ) : (
        <div className="space-y-4 pb-8">
          <DiscoverGrid
            key={`${submittedQuery}-${filters.genre}-${filters.decade}-${filters.sort}`}
            items={results}
            onItemClick={logSearchResultClick}
          />
          {loadingMore && (
            <div className={cn(BLEED_PX, "flex items-center justify-center py-4")}>
              <Loader2 className="h-5 w-5 animate-spin text-muted" />
            </div>
          )}
          {hasMorePages && !loadingMore ? (
            <div ref={sentinelRef} className="h-1" />
          ) : pagination ? (
            <p className={cn(BLEED_PX, "py-4 text-center text-sm text-muted")}>
              You&rsquo;ve reached the end — {pagination.items.toLocaleString()} results for &ldquo;
              {submittedQuery}&rdquo;
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
