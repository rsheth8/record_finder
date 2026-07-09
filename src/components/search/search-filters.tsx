"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { QUIZ_GENRES, QUIZ_DECADES, type QuizGenre, type QuizDecade } from "@/lib/types";
import type { SearchSortOption } from "@/lib/discogs/client";
import { cn } from "@/lib/utils";
import { SlidersHorizontal, X } from "lucide-react";

export interface SearchFilterState {
  genre: QuizGenre | null;
  decade: QuizDecade | null;
  sort: SearchSortOption;
}

export const DEFAULT_SEARCH_FILTERS: SearchFilterState = {
  genre: null,
  decade: null,
  sort: "relevance",
};

export function hasActiveSearchFilters(filters: SearchFilterState): boolean {
  return filters.genre !== null || filters.decade !== null || filters.sort !== "relevance";
}

const SORT_OPTIONS: { value: SearchSortOption; label: string }[] = [
  { value: "relevance", label: "Best match" },
  { value: "most_wanted", label: "Most wanted" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "artist_az", label: "Artist A–Z" },
];

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "pressable focus-ring rounded-full border px-3 py-1.5 text-xs",
        active
          ? "border-accent bg-accent-muted text-accent"
          : "border-border text-muted hover:border-accent/50 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Search's filter bar, scoped to what's actually real for a server-paginated
 * catalog query: genre, decade, and sort all become Discogs search params
 * (see searchCatalog) that correctly narrow/order the *entire* matching
 * catalog, not just the current page. Deliberately does NOT include
 * min-rating/max-price/for-sale/format filters like Discover's — those need
 * per-item price/rating data that's only fetched for a bounded subset of
 * each page (see SEARCH_ENRICH_LIMIT), so filtering by them here would be
 * silently incomplete across the full multi-page result set. */
export function SearchFilters({
  filters,
  onChange,
}: {
  filters: SearchFilterState;
  onChange: (next: SearchFilterState) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const active = hasActiveSearchFilters(filters);
  const activeCount = [filters.genre ? 1 : 0, filters.decade ? 1 : 0, filters.sort !== "relevance" ? 1 : 0].reduce(
    (a, b) => a + b,
    0,
  );

  function reset() {
    onChange(DEFAULT_SEARCH_FILTERS);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          className={cn("gap-2", active && "border-accent/50 text-accent")}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {active && <Badge variant="accent">{activeCount}</Badge>}
        </Button>
        {active && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            className="gap-1 text-muted"
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {expanded && (
        <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
          <label className="block max-w-xs space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Sort by
            </span>
            <Select
              value={filters.sort}
              onChange={(e) =>
                onChange({ ...filters, sort: e.target.value as SearchSortOption })
              }
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </label>

          <div className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Genre
            </span>
            <div className="flex flex-wrap gap-2">
              {QUIZ_GENRES.map((genre) => (
                <FilterPill
                  key={genre}
                  active={filters.genre === genre}
                  onClick={() =>
                    onChange({ ...filters, genre: filters.genre === genre ? null : genre })
                  }
                >
                  {genre}
                </FilterPill>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Decade
            </span>
            <div className="flex flex-wrap gap-2">
              {QUIZ_DECADES.map((decade) => (
                <FilterPill
                  key={decade}
                  active={filters.decade === decade}
                  onClick={() =>
                    onChange({ ...filters, decade: filters.decade === decade ? null : decade })
                  }
                >
                  {decade}
                </FilterPill>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
