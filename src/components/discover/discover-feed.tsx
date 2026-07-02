"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CarouselRow } from "@/components/discover/carousel-row";
import { DiscoverFilters } from "@/components/discover/discover-filters";
import { DiscoverGrid } from "@/components/discover/discover-grid";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  DEFAULT_DISCOVER_FILTERS,
  filterRecommendations,
  hasActiveFilters,
} from "@/lib/recommendations/filter";
import { groupRecommendations } from "@/lib/recommendations/group";
import type { QuizDecade, QuizGenre, Recommendation } from "@/lib/types";
import { SOURCE_LABELS, type SourceError } from "@/lib/errors";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import { LayoutGrid, RefreshCw, Rows3, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ViewMode = "rows" | "grid";

export function DiscoverFeed({
  recommendations: initialRecommendations,
  quizGenres = [],
  quizDecades = [],
  error: initialError,
  degraded: initialDegraded = [],
}: {
  recommendations: Recommendation[];
  quizGenres?: QuizGenre[];
  quizDecades?: QuizDecade[];
  error?: string | null;
  degraded?: SourceError[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError ?? null);
  const [degraded, setDegraded] = useState(initialDegraded);
  const [dismissedDegraded, setDismissedDegraded] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_DISCOVER_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>("rows");

  const filtered = useMemo(
    () => filterRecommendations(initialRecommendations, filters),
    [initialRecommendations, filters],
  );

  const filtering = hasActiveFilters(filters);

  const rows = useMemo(() => {
    if (filtering || viewMode === "grid") return [];
    return groupRecommendations(filtered, quizGenres, quizDecades);
  }, [filtered, quizGenres, quizDecades, filtering, viewMode]);

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

      if (!data.recommendations?.length) {
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

  const filteredRowTitle = filtering
    ? filters.search.trim()
      ? `Results for "${filters.search.trim()}"`
      : "Filtered picks"
    : "All albums";

  return (
    <div className="space-y-6">
      <DiscoverFilters
        recommendations={initialRecommendations}
        filters={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <div className="flex items-center justify-between gap-3 px-4 sm:px-[max(1rem,calc((100vw-72rem)/2+1rem))]">
        <div className="flex rounded-lg border border-zinc-800 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("rows")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors",
              viewMode === "rows"
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300",
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
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300",
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
        <div className="mx-4 rounded-lg border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-300 sm:mx-[max(1rem,calc((100vw-72rem)/2+1rem))]">
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
          <CardTitle>No matches</CardTitle>
          <CardDescription className="mt-2">
            {initialRecommendations.length === 0
              ? "Complete the quiz and connect Spotify to generate picks."
              : "Try clearing filters or broadening your search."}
          </CardDescription>
        </Card>
      ) : viewMode === "grid" || filtering ? (
        <div className="space-y-4 pb-8">
          {!filtering && viewMode === "grid" ? (
            <h2 className="px-4 text-lg font-semibold text-zinc-100 sm:px-[max(1rem,calc((100vw-72rem)/2+1rem))]">
              All albums
            </h2>
          ) : (
            <h2 className="px-4 text-lg font-semibold text-zinc-100 sm:px-[max(1rem,calc((100vw-72rem)/2+1rem))]">
              {filteredRowTitle}
            </h2>
          )}
          <DiscoverGrid items={filtered} />
        </div>
      ) : (
        <div className="space-y-12 pb-8">
          {rows.map((row) => (
            <CarouselRow key={row.id} title={row.title} items={row.items} />
          ))}
        </div>
      )}
    </div>
  );
}
