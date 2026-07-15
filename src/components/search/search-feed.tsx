"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Disc3, Loader2, Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DiscoverGrid } from "@/components/discover/discover-grid";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import { SearchSuggestions } from "@/components/search/search-suggestions";
import { SearchLaunchpad } from "@/components/search/search-launchpad";
import {
  SearchFilters,
  DEFAULT_SEARCH_FILTERS,
  type SearchFilterState,
} from "@/components/search/search-filters";
import { BLEED_MX, BLEED_PX, FULL_BLEED } from "@/lib/layout";
import { useInView } from "@/hooks/use-in-view";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useRecentSearches } from "@/hooks/use-recent-searches";
import { cn } from "@/lib/utils";
import type { QuizGenre } from "@/lib/types";
import type { Recommendation, SearchPagination } from "@/lib/types";

/** How many newly-arrived results to request price/rating/fair-value for at
 * once — roughly what's visible in the grid on a typical viewport. */
const ENRICH_BATCH_SIZE = 12;
/** Top matches surfaced in the autocomplete dropdown while typing. */
const SUGGESTION_COUNT = 6;
/** Debounce before firing a suggestion request — paces search-as-you-type
 * against Discogs' ~1 req/sec throttle. */
const SUGGEST_DEBOUNCE_MS = 350;

/** A committed search needs *something* to anchor it: real text, or a genre/
 * decade facet (a broad catalog browse). Sort/format alone aren't a search —
 * matching the API route, which 400s on a query with neither text nor a
 * genre/decade/sort anchor. */
function isSearchable(query: string, filters: SearchFilterState): boolean {
  return !!query.trim() || !!filters.genre || !!filters.decade;
}

function filtersKey(query: string, filters: SearchFilterState): string {
  return [query.trim(), filters.genre, filters.decade, filters.format, filters.sort].join("|");
}

function toParams(query: string, filters: SearchFilterState, page?: number): URLSearchParams {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (filters.genre) params.set("genre", filters.genre);
  if (filters.decade) params.set("decade", filters.decade);
  if (filters.format) params.set("format", filters.format);
  if (filters.sort !== "relevance") params.set("sort", filters.sort);
  if (page && page > 1) params.set("page", String(page));
  return params;
}

/** Fire-and-forget click-through beacon for the search → click → reservation
 * funnel — doesn't block navigation, and a failure is silently dropped. */
function logSearchResultClick(rec: Recommendation) {
  const body = JSON.stringify({
    type: "search_result_click",
    metadata: { discogsReleaseId: rec.discogsReleaseId },
  });
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/analytics/event", new Blob([body], { type: "application/json" }));
    return;
  }
  fetch("/api/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function NoResultsState({
  query,
  onQuery,
}: {
  query: string;
  onQuery: (q: string) => void;
}) {
  return (
    <EmptyState
      icon={Disc3}
      title="No vinyl found"
      description={
        <>
          Nothing on Discogs matched &ldquo;{query}&rdquo;. Try a different spelling, a
          shorter query, or one of these:
          <span className="mt-4 flex flex-wrap justify-center gap-2">
            {["Fleetwood Mac", "Miles Davis", "Radiohead", "Daft Punk"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onQuery(s)}
                className="pressable focus-ring rounded-full border border-border px-3 py-1 text-sm text-foreground transition-colors hover:border-accent/50 hover:bg-surface-elevated"
              >
                {s}
              </button>
            ))}
          </span>
        </>
      }
    />
  );
}

export function SearchFeed({
  initialQuery = "",
  initialFilters = DEFAULT_SEARCH_FILTERS,
  tasteGenres = [],
}: {
  initialQuery?: string;
  initialFilters?: SearchFilterState;
  tasteGenres?: QuizGenre[];
}) {
  const router = useRouter();
  const { recent, add: addRecent, remove: removeRecent, clear: clearRecent } = useRecentSearches();

  // Input text (typing) vs. the committed search that drives the grid.
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<SearchFilterState>(initialFilters);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);

  const [page, setPage] = useState(1);
  const [results, setResults] = useState<Recommendation[]>([]);
  const [pagination, setPagination] = useState<SearchPagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Autocomplete dropdown.
  const [suggestions, setSuggestions] = useState<Recommendation[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const activeRequest = useRef<AbortController | null>(null);
  const suggestRequest = useRef<AbortController | null>(null);
  const resultsRef = useRef<Recommendation[]>([]);
  const mounted = useRef(true);
  // The last full search-response we fetched for the dropdown, reused as the
  // grid's page-1 results when the user commits that same query+filters —
  // saves a duplicate Discogs call and makes the committed search feel instant.
  const suggestCache = useRef<{
    key: string;
    results: Recommendation[];
    pagination: SearchPagination | null;
  } | null>(null);

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
      setResults((prev) => {
        const next = prev.map((item) => enrichedById.get(item.discogsReleaseId) ?? item);
        resultsRef.current = next;
        return next;
      });
    } catch {
      // Best-effort — cards just stay without a price badge.
    }
  }

  // Plain function declarations (not useCallback) on purpose: they call
  // setState synchronously, which the set-state-in-effect lint rule flags when
  // it can trace a memoized callback invoked from an effect — a plain function
  // isn't traced, matching DiscoverFeed's `refresh()`. Identity instability is
  // harmless here: neither is used in an effect's dependency array.
  async function runSearch(
    q: string,
    targetPage: number,
    activeFilters: SearchFilterState,
    { append = false }: { append?: boolean } = {},
  ) {
    if (!isSearchable(q, activeFilters)) return;

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

    // Reuse the dropdown's already-fetched page for an instant page-1 commit.
    const key = filtersKey(q, activeFilters);
    if (!append && targetPage === 1 && suggestCache.current?.key === key) {
      const cached = suggestCache.current;
      resultsRef.current = cached.results;
      setResults(cached.results);
      setPagination(cached.pagination);
      setPage(1);
      setLoading(false);
      if (activeRequest.current === controller) activeRequest.current = null;
      void enrichItems(cached.results.slice(0, ENRICH_BATCH_SIZE));
      return;
    }

    try {
      const params = toParams(q, activeFilters, targetPage);
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

  /** Commit a search: reflect it in the URL (shareable + back/forward), update
   * the committed state, remember the text query, and run it. */
  function commitSearch(q: string, nextFilters: SearchFilterState) {
    if (!isSearchable(q, nextFilters)) return;
    const params = toParams(q, nextFilters);
    const url = params.toString() ? `/search?${params.toString()}` : "/search";
    window.history.pushState({}, "", url);

    setQuery(q);
    setFilters(nextFilters);
    setSubmittedQuery(q);
    setDropdownOpen(false);
    setActiveIndex(-1);
    if (q.trim()) addRecent(q);
    void runSearch(q, 1, nextFilters);
  }

  // Run the initial URL-provided search once on mount, and respond to
  // back/forward by re-reading the URL and re-running (or resetting to the
  // launchpad when it's empty).
  const didInitialRun = useRef(false);
  useEffect(() => {
    if (!didInitialRun.current) {
      didInitialRun.current = true;
      if (isSearchable(initialQuery, initialFilters)) {
        // Deferred past the synchronous effect body so the fetch's setState
        // calls don't run as a cascading render during commit.
        queueMicrotask(() => runSearch(initialQuery, 1, initialFilters));
      }
    }

    function onPopState() {
      const sp = new URLSearchParams(window.location.search);
      const q = sp.get("q") ?? "";
      const restored: SearchFilterState = {
        genre: (sp.get("genre") as SearchFilterState["genre"]) ?? null,
        decade: (sp.get("decade") as SearchFilterState["decade"]) ?? null,
        format: (sp.get("format") as SearchFilterState["format"]) ?? null,
        sort: (sp.get("sort") as SearchFilterState["sort"]) ?? "relevance",
      };
      setQuery(q);
      setFilters(restored);
      setSubmittedQuery(q);
      setDropdownOpen(false);
      if (isSearchable(q, restored)) {
        void runSearch(q, 1, restored);
      } else {
        setResults([]);
        resultsRef.current = [];
        setPagination(null);
        setHasSearched(false);
        setError(null);
      }
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Autocomplete: debounced suggestion fetch as the user types ---
  const debouncedQuery = useDebouncedValue(query, SUGGEST_DEBOUNCE_MS);
  useEffect(() => {
    const q = debouncedQuery.trim();
    // Only while focused, with a couple chars, and not just echoing the search
    // that's already committed and on screen. Aborting (not setState) keeps
    // this effect body free of synchronous state updates; stale suggestions
    // are simply never rendered (see `showDropdown`).
    if (!dropdownOpen || q.length < 2 || q === submittedQuery.trim()) {
      suggestRequest.current?.abort();
      return;
    }

    suggestRequest.current?.abort();
    const controller = new AbortController();
    suggestRequest.current = controller;

    (async () => {
      setSuggestLoading(true);
      try {
        const params = toParams(debouncedQuery, filters);
        const res = await fetch(`/api/discogs/search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (controller.signal.aborted) return;
        const fetched = (data.results ?? []) as Recommendation[];
        suggestCache.current = {
          key: filtersKey(debouncedQuery, filters),
          results: fetched,
          pagination: data.pagination ?? null,
        };
        setSuggestions(fetched.slice(0, SUGGESTION_COUNT));
      } catch {
        // dropdown just stays empty
      } finally {
        if (suggestRequest.current === controller) setSuggestLoading(false);
      }
    })();

    return () => controller.abort();
  }, [debouncedQuery, dropdownOpen, filters, submittedQuery]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (dropdownOpen && activeIndex >= 0 && activeIndex < suggestions.length) {
      selectRelease(suggestions[activeIndex]);
      return;
    }
    commitSearch(query, filters);
  }

  function selectRelease(rec: Recommendation) {
    logSearchResultClick(rec);
    if (query.trim()) addRecent(query);
    setDropdownOpen(false);
    router.push(`/album/${rec.discogsReleaseId}`);
  }

  function handleFiltersChange(next: SearchFilterState) {
    // Re-run against the whole catalog whenever there's an active search to
    // refine; otherwise just hold the selection for the next submit.
    if (isSearchable(submittedQuery, next)) {
      commitSearch(submittedQuery, next);
    } else {
      setFilters(next);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!dropdownOpen) return;
    const max = suggestions.length; // last index = the "search all" row
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i >= max ? 0 : i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? max : i - 1));
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
      setActiveIndex(-1);
    } else if (e.key === "Enter" && activeIndex === max) {
      e.preventDefault();
      commitSearch(query, filters);
    }
  }

  function loadNextPage() {
    if (loading || loadingMore) return;
    if (!pagination || page >= pagination.pages) return;
    void runSearch(submittedQuery, page + 1, filters, { append: true });
  }

  const hasMorePages = !!pagination && page < pagination.pages;
  const sentinelRef = useInView<HTMLDivElement>(loadNextPage, {
    rootMargin: "400px",
    resetKey: page,
  });

  const showDropdown =
    dropdownOpen &&
    query.trim().length >= 2 &&
    query.trim() !== submittedQuery.trim() &&
    (suggestLoading || suggestions.length > 0);

  return (
    <div className={cn(FULL_BLEED, "space-y-6")}>
      <form onSubmit={handleSubmit} className={cn(BLEED_PX, "flex gap-2")}>
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setDropdownOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => setDropdownOpen(false)}
            onKeyDown={handleKeyDown}
            placeholder="Search artist or album..."
            className="pl-10"
            role="combobox"
            aria-expanded={showDropdown}
            aria-autocomplete="list"
          />
          {showDropdown && (
            <SearchSuggestions
              query={query.trim()}
              suggestions={suggestions}
              loading={suggestLoading}
              activeIndex={activeIndex}
              onHover={setActiveIndex}
              onPickRelease={selectRelease}
              onPickSearchAll={() => commitSearch(query, filters)}
            />
          )}
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
        <div className={BLEED_PX}>
          <SearchLaunchpad
            recent={recent}
            tasteGenres={tasteGenres}
            onQuery={(q) => commitSearch(q, DEFAULT_SEARCH_FILTERS)}
            onGenre={(genre) => commitSearch("", { ...DEFAULT_SEARCH_FILTERS, genre })}
            onClearRecent={clearRecent}
            onRemoveRecent={removeRecent}
          />
        </div>
      ) : results.length === 0 && !error ? (
        <Card className={BLEED_MX}>
          <NoResultsState
            query={submittedQuery}
            onQuery={(q) => commitSearch(q, DEFAULT_SEARCH_FILTERS)}
          />
        </Card>
      ) : (
        <div className="space-y-4 pb-8">
          {pagination && (
            <p className={cn(BLEED_PX, "text-sm text-muted")}>
              {pagination.items.toLocaleString()} result{pagination.items === 1 ? "" : "s"}
              {submittedQuery.trim() ? (
                <>
                  {" "}for <span className="text-foreground">&ldquo;{submittedQuery}&rdquo;</span>
                </>
              ) : null}
            </p>
          )}
          <DiscoverGrid
            key={filtersKey(submittedQuery, filters)}
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
              You&rsquo;ve reached the end — {pagination.items.toLocaleString()} results
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
