"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CarouselRow } from "@/components/discover/carousel-row";
import { DiscoverFilters } from "@/components/discover/discover-filters";
import { DiscoverGrid } from "@/components/discover/discover-grid";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  DEFAULT_DISCOVER_FILTERS,
  filterRecommendations,
  hasContentFilters,
} from "@/lib/recommendations/filter";
import { groupRecommendations } from "@/lib/recommendations/group";
import type { QuizDecade, QuizGenre, Recommendation } from "@/lib/types";
import { SOURCE_LABELS, type SourceError } from "@/lib/errors";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import { Disc3, LayoutGrid, RefreshCw, Rows3, ShoppingBag, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ViewMode = "rows" | "grid";

function EmptyShelf() {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="relative mb-6">
        <Disc3 className="h-16 w-16 text-muted/40" />
        <div className="absolute -bottom-2 left-1/2 h-1 w-20 -translate-x-1/2 rounded-full bg-border" />
      </div>
      <p className="font-display text-lg font-semibold text-foreground">Shelf is empty</p>
      <p className="mt-2 max-w-sm text-sm text-muted">
        No albums match your filters. Try broadening your search or refreshing picks.
      </p>
    </div>
  );
}

export function DiscoverFeed({
  recommendations: initialRecommendations,
  quizGenres = [],
  quizDecades = [],
  error: initialError,
  degraded: initialDegraded = [],
  needsGeneration = false,
}: {
  recommendations: Recommendation[];
  quizGenres?: QuizGenre[];
  quizDecades?: QuizDecade[];
  error?: string | null;
  degraded?: SourceError[];
  needsGeneration?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError ?? null);
  const [recommendations, setRecommendations] = useState(initialRecommendations);
  const [degraded, setDegraded] = useState(initialDegraded);
  const [dismissedDegraded, setDismissedDegraded] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_DISCOVER_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>("rows");
  const autoTriggered = useRef(false);

  // First visit with no cached picks: generate them client-side (with the loader)
  // rather than blocking the page request on a ~25s Discogs pass. Guarded so it
  // fires at most once, even if generation returns nothing.
  useEffect(() => {
    if (needsGeneration && !autoTriggered.current) {
      autoTriggered.current = true;
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsGeneration]);

  const filtered = useMemo(
    () => filterRecommendations(recommendations, filters),
    [recommendations, filters],
  );

  const contentFiltering = hasContentFilters(filters);

  const rows = useMemo(() => {
    if (contentFiltering || viewMode === "grid") return [];
    return groupRecommendations(filtered, quizGenres, quizDecades);
  }, [filtered, quizGenres, quizDecades, contentFiltering, viewMode]);

  async function refresh() {
    setLoading(true);
    setError(null);
    setDismissedDegraded(false);

    try {
      const res = await fetch("/api/recommendations", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to load recommendations");
        return;
      }

      if (data.recommendations?.length) {
        setRecommendations(data.recommendations);
      } else {
        setError("No vinyl matches found. Try adjusting your quiz preferences.");
      }

      setDegraded(data.degraded ?? []);
      router.refresh();
    } catch {
      setError("Something went wrong. Check your API keys and try again.");
    } finally {
      setLoading(false);
    }
  }

  const filteredRowTitle = contentFiltering
    ? filters.search.trim()
      ? `Results for "${filters.search.trim()}"`
      : "Filtered picks"
    : "All albums";

  const featuredRow = rows[0];
  const remainingRows = rows.slice(1);

  return (
    <div className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 space-y-6">
      <div className="mx-4 rounded-xl border border-border bg-surface/60 p-4 noir-glass sm:mx-[max(1rem,calc((100vw-72rem)/2+1rem))]">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          How it works
        </p>
        <ol className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            { n: 1, title: "Browse picks", desc: "Scroll rows or switch to grid view" },
            { n: 2, title: "Open an album", desc: "See pressing info, tracks, and pricing" },
            { n: 3, title: "Reserve on Discogs", desc: "Shop listings or reserve with credits", icon: ShoppingBag },
          ].map((step) => (
            <li key={step.n} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-muted text-xs font-bold text-accent">
                {step.n}
              </span>
              <div>
                <p className="flex items-center gap-1 text-sm font-medium text-foreground">
                  {step.icon && <step.icon className="h-3.5 w-3.5" />}
                  {step.title}
                </p>
                <p className="text-xs text-muted">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="px-4 sm:px-[max(1rem,calc((100vw-72rem)/2+1rem))]">
        <DiscoverFilters
          recommendations={recommendations}
          filters={filters}
          onChange={setFilters}
          resultCount={filtered.length}
        />
      </div>

      <div className="flex items-center justify-between gap-3 px-4 sm:px-[max(1rem,calc((100vw-72rem)/2+1rem))]">
        <div className="flex rounded-lg border border-border p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("rows")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors",
              viewMode === "rows"
                ? "bg-surface-elevated text-foreground"
                : "text-muted hover:text-foreground",
            )}
          >
            <Rows3 className="h-3.5 w-3.5" />
            Rows
          </button>
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors",
              viewMode === "grid"
                ? "bg-surface-elevated text-foreground"
                : "text-muted hover:text-foreground",
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Grid
          </button>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh picks
        </Button>
      </div>

      {error && (
        <div className="mx-4 rounded-lg border border-error/30 bg-error/10 p-4 text-sm text-error sm:mx-[max(1rem,calc((100vw-72rem)/2+1rem))]">
          {error}
        </div>
      )}

      {!dismissedDegraded && degraded.length > 0 && (
        <div className="mx-4 flex items-start gap-3 rounded-lg border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-200 sm:mx-[max(1rem,calc((100vw-72rem)/2+1rem))]">
          <div className="flex-1 space-y-1">
            {degraded.map((d, i) => (
              <p key={i}>
                <span className="font-medium">{SOURCE_LABELS[d.source]}:</span>{" "}
                {d.message}
              </p>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setDismissedDegraded(true)}
            className="text-amber-400/70 hover:text-amber-200"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <VinylLoader variant="section" context="discover" />
      ) : filtered.length === 0 ? (
        <Card className="mx-4 sm:mx-[max(1rem,calc((100vw-72rem)/2+1rem))]">
          {recommendations.length === 0 ? (
            <>
              <CardTitle>No picks yet</CardTitle>
              <CardDescription className="mt-2">
                Complete the quiz and connect Spotify to generate picks.
              </CardDescription>
            </>
          ) : (
            <EmptyShelf />
          )}
        </Card>
      ) : viewMode === "grid" || contentFiltering ? (
        <div className="space-y-4 pb-8">
          <h2 className="px-4 font-display text-lg font-semibold text-foreground sm:px-[max(1rem,calc((100vw-72rem)/2+1rem))]">
            {filteredRowTitle}
          </h2>
          <DiscoverGrid items={filtered} />
        </div>
      ) : (
        <div className="space-y-12 pb-8">
          {featuredRow && (
            <CarouselRow
              key={`featured-${featuredRow.id}`}
              title={featuredRow.title}
              items={featuredRow.items}
              featured
              rowIndex={0}
            />
          )}
          {remainingRows.map((row, i) => (
            <CarouselRow
              key={row.id}
              title={row.title}
              items={row.items}
              rowIndex={i + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
