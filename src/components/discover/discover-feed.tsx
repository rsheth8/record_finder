"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CarouselRow } from "@/components/discover/carousel-row";
import { BrowseRow } from "@/components/discover/browse-row";
import { DiscoverFilters } from "@/components/discover/discover-filters";
import { DiscoverGrid } from "@/components/discover/discover-grid";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DEFAULT_DISCOVER_FILTERS,
  filterRecommendations,
  hasContentFilters,
} from "@/lib/recommendations/filter";
import { groupRecommendations } from "@/lib/recommendations/group";
import { buildBrowseRowQueue } from "@/lib/recommendations/browse-rows";
import type { QuizDecade, QuizGenre, Recommendation } from "@/lib/types";
import { SOURCE_LABELS, type SourceError } from "@/lib/errors";
import { BLEED_MX, BLEED_PX, FULL_BLEED } from "@/lib/layout";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import { useNowMinute } from "@/hooks/use-now-minute";
import { useInView } from "@/hooks/use-in-view";
import { Disc3, LayoutGrid, RefreshCw, Rows3, ShoppingBag, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** How many live-catalog browse rows to have mounted at once, at minimum —
 * grows as the user scrolls into the sentinel at the bottom of the row list. */
const INITIAL_BROWSE_ROWS = 2;

type ViewMode = "rows" | "grid";

/** "in 42m" / "in 2h 5m" / "refreshing soon" — how long until the cached picks
 * expire and regenerate on next visit. */
function formatRefreshHint(expiresAt: Date, now: Date): string {
  const diffMin = Math.round((expiresAt.getTime() - now.getTime()) / 60_000);
  if (diffMin <= 0) return "refreshing soon";
  if (diffMin < 60) return `in ${diffMin}m`;
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return mins > 0 ? `in ${hours}h ${mins}m` : `in ${hours}h`;
}

function EmptyShelf({ searchQuery }: { searchQuery: string }) {
  return (
    <EmptyState
      icon={Disc3}
      title="Shelf is empty"
      description="No albums match your filters. Try broadening your search or refreshing picks."
    >
      {searchQuery && (
        <Link
          href={`/search?q=${encodeURIComponent(searchQuery)}`}
          className="focus-ring mt-4 rounded-sm text-sm font-medium text-accent hover:underline"
        >
          Search all vinyl for &ldquo;{searchQuery}&rdquo; →
        </Link>
      )}
    </EmptyState>
  );
}

export function DiscoverFeed({
  recommendations: initialRecommendations,
  quizGenres = [],
  quizDecades = [],
  error: initialError,
  degraded: initialDegraded = [],
  needsGeneration = false,
  cacheExpiresAt = null,
}: {
  recommendations: Recommendation[];
  quizGenres?: QuizGenre[];
  quizDecades?: QuizDecade[];
  error?: string | null;
  degraded?: SourceError[];
  needsGeneration?: boolean;
  /** ISO timestamp for when the cached picks expire and regenerate — used only
   * to show a "refreshes automatically in Xm" hint, not to drive any refetch. */
  cacheExpiresAt?: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError ?? null);
  const [recommendations, setRecommendations] = useState(initialRecommendations);
  const [degraded, setDegraded] = useState(initialDegraded);
  const [dismissedDegraded, setDismissedDegraded] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_DISCOVER_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>("rows");
  const now = useNowMinute();
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
  const showRows = !contentFiltering && viewMode === "rows";

  const rows = useMemo(() => {
    if (!showRows) return [];
    return groupRecommendations(filtered, quizGenres);
  }, [filtered, quizGenres, showRows]);

  // Genres already given a scored row above shouldn't also get a duplicate
  // live-catalog browse row right after it.
  const usedGenres = useMemo(
    () => rows.filter((r) => r.id.startsWith("genre-")).map((r) => r.title),
    [rows],
  );

  const browseRowQueue = useMemo(() => {
    if (!showRows) return [];
    return buildBrowseRowQueue(quizGenres, quizDecades, usedGenres);
  }, [showRows, quizGenres, quizDecades, usedGenres]);

  const [visibleBrowseCount, setVisibleBrowseCount] = useState(INITIAL_BROWSE_ROWS);
  // Reset when the queue itself changes (e.g. quiz retaken) rather than
  // carrying over a stale scroll position into a different queue. Adjusting
  // state directly during render (React's documented pattern for "reset
  // state when a prop/derived value changes") instead of an effect, which
  // would cause an extra commit.
  const [queueForReset, setQueueForReset] = useState(browseRowQueue);
  if (queueForReset !== browseRowQueue) {
    setQueueForReset(browseRowQueue);
    setVisibleBrowseCount(INITIAL_BROWSE_ROWS);
  }

  // Modest lookahead, not a large one: the resetKey mechanism above re-checks
  // intersection after every mount, so a large rootMargin relative to a
  // row's height (~300px) cascades through many rows at once — even with no
  // further scrolling — instead of pacing to roughly one row ahead of the
  // user's actual scroll position.
  const sentinelRef = useInView<HTMLDivElement>(
    () => {
      setVisibleBrowseCount((n) => Math.min(n + 1, browseRowQueue.length));
    },
    { rootMargin: "400px", resetKey: visibleBrowseCount },
  );

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
    <div className={cn(FULL_BLEED, "space-y-6")}>
      <div className={cn(BLEED_MX, "rounded-xl border border-border bg-surface/60 p-4 noir-glass")}>
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

      <div className={BLEED_PX}>
        <DiscoverFilters
          recommendations={recommendations}
          filters={filters}
          onChange={setFilters}
          resultCount={filtered.length}
        />
      </div>

      <div className={cn(BLEED_PX, "flex items-center justify-between gap-3")}>
        <div className="flex rounded-lg border border-border p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("rows")}
            className={cn(
              "pressable focus-ring flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs",
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
              "pressable focus-ring flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs",
              viewMode === "grid"
                ? "bg-surface-elevated text-foreground"
                : "text-muted hover:text-foreground",
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Grid
          </button>
        </div>

        <div className="flex items-center gap-3">
          {!loading && cacheExpiresAt && now && (
            <p className="hidden text-xs text-muted sm:block">
              Auto-refreshes {formatRefreshHint(new Date(cacheExpiresAt), now)}
            </p>
          )}
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
      </div>

      {error && (
        <div className={cn(BLEED_MX, "rounded-lg border border-error/30 bg-error/10 p-4 text-sm text-error")}>
          {error}
        </div>
      )}

      {!dismissedDegraded && degraded.length > 0 && (
        <div className={cn(BLEED_MX, "flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning")}>
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
            className="focus-ring rounded-sm text-warning/70 transition-colors hover:text-warning"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <VinylLoader variant="section" context="discover" />
      ) : filtered.length === 0 ? (
        <Card className={BLEED_MX}>
          {recommendations.length === 0 ? (
            <EmptyState
              icon={Disc3}
              title="No picks yet"
              description="Complete the quiz and connect Spotify to generate picks."
            />
          ) : (
            <EmptyShelf searchQuery={filters.search.trim()} />
          )}
        </Card>
      ) : viewMode === "grid" || contentFiltering ? (
        <div className="space-y-4 pb-8">
          <h2 className={cn(BLEED_PX, "font-display text-lg font-semibold text-foreground")}>
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
          {browseRowQueue.slice(0, visibleBrowseCount).map((def, i) => (
            <BrowseRow key={def.id} def={def} rowIndex={rows.length + i} />
          ))}
          {visibleBrowseCount < browseRowQueue.length ? (
            <div ref={sentinelRef} className="h-1" />
          ) : browseRowQueue.length > 0 ? (
            <p className={cn(BLEED_PX, "py-4 text-center text-sm text-muted")}>
              That&rsquo;s everything for now — refresh picks for a new set.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
