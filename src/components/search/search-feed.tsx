"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Disc3, Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { DiscoverGrid } from "@/components/discover/discover-grid";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import type { Recommendation, SearchPagination } from "@/lib/types";

// DiscoverGrid centers its content with a viewport-relative padding formula
// (see discover-grid.tsx) meant for a full-bleed container, not one nested
// inside AppShell's max-w-6xl wrapper — breaking out of that wrapper here
// (same trick DiscoverFeed uses) keeps the math correct at wide viewports.
const WIDE_PAD = "px-4 sm:px-[max(1rem,calc((100vw-72rem)/2+1rem))]";
const WIDE_MARGIN = "mx-4 sm:mx-[max(1rem,calc((100vw-72rem)/2+1rem))]";

function IntroState() {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="relative mb-6">
        <SearchIcon className="h-16 w-16 text-muted/40" />
      </div>
      <p className="font-display text-lg font-semibold text-foreground">
        Search any artist or album on vinyl
      </p>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Real Discogs pressings, priced and rated — no quiz or sign-in required.
      </p>
    </div>
  );
}

function NoResultsState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="relative mb-6">
        <Disc3 className="h-16 w-16 text-muted/40" />
        <div className="absolute -bottom-2 left-1/2 h-1 w-20 -translate-x-1/2 rounded-full bg-border" />
      </div>
      <p className="font-display text-lg font-semibold text-foreground">No vinyl found</p>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Nothing on Discogs matched &ldquo;{query}&rdquo;. Try a different spelling or a
        shorter query.
      </p>
    </div>
  );
}

export function SearchFeed({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<Recommendation[]>([]);
  const [pagination, setPagination] = useState<SearchPagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  async function runSearch(q: string, targetPage: number) {
    const trimmed = q.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const res = await fetch(
        `/api/discogs/search?q=${encodeURIComponent(trimmed)}&page=${targetPage}`,
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Search failed");
        setResults([]);
        setPagination(null);
        return;
      }

      setResults(data.results ?? []);
      setPagination(data.pagination ?? null);
    } catch {
      setError("Something went wrong. Check your connection and try again.");
      setResults([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }

  // Deep-linked queries (e.g. from Discover's "search all vinyl" bridge) run
  // automatically on mount instead of waiting for a manual submit.
  const autoTriggered = useRef(false);
  useEffect(() => {
    if (initialQuery.trim() && !autoTriggered.current) {
      autoTriggered.current = true;
      void runSearch(initialQuery, 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmittedQuery(query);
    setPage(1);
    void runSearch(query, 1);
  }

  function goToPage(next: number) {
    setPage(next);
    void runSearch(submittedQuery, next);
  }

  return (
    <div className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 space-y-6">
      <form onSubmit={handleSubmit} className={`flex gap-2 ${WIDE_PAD}`}>
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

      {error && (
        <div className={`rounded-lg border border-error/30 bg-error/10 p-4 text-sm text-error ${WIDE_MARGIN}`}>
          {error}
        </div>
      )}

      {loading ? (
        <VinylLoader variant="section" context="search" />
      ) : !hasSearched ? (
        <Card className={WIDE_MARGIN}>
          <IntroState />
        </Card>
      ) : results.length === 0 && !error ? (
        <Card className={WIDE_MARGIN}>
          <NoResultsState query={submittedQuery} />
        </Card>
      ) : (
        <div className="space-y-4 pb-8">
          <DiscoverGrid items={results} />
          {pagination && pagination.pages > 1 && (
            <div className={`flex items-center justify-center gap-3 ${WIDE_PAD}`}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>
              <span className="text-sm text-muted">
                Page {pagination.page} of {pagination.pages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => goToPage(page + 1)}
                disabled={page >= pagination.pages}
                className="gap-1"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
