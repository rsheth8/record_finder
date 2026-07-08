"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Disc3, Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DiscoverGrid } from "@/components/discover/discover-grid";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import { BLEED_MX, BLEED_PX, FULL_BLEED } from "@/lib/layout";
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
          <DiscoverGrid key={`${submittedQuery}-${page}`} items={results} />
          {pagination && pagination.pages > 1 && (
            <div className={cn(BLEED_PX, "flex items-center justify-center gap-3")}>
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
