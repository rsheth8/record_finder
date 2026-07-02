"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DEFAULT_DISCOVER_FILTERS,
  getAvailableGenres,
  hasActiveFilters,
  type DiscoverFilterState,
  type SortOption,
} from "@/lib/recommendations/filter";
import { QUIZ_DECADES, type QuizDecade, type Recommendation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "best_match", label: "Best match" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "highest_rated", label: "Highest rated" },
  { value: "artist_az", label: "Artist A–Z" },
];

const RATING_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Any rating" },
  { value: 3, label: "3+ stars" },
  { value: 3.5, label: "3.5+ stars" },
  { value: 4, label: "4+ stars" },
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
        "rounded-full border px-3 py-1.5 text-xs transition-colors",
        active
          ? "border-violet-500 bg-violet-600/20 text-violet-200"
          : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200",
      )}
    >
      {children}
    </button>
  );
}

export function DiscoverFilters({
  recommendations,
  filters,
  onChange,
  resultCount,
}: {
  recommendations: Recommendation[];
  filters: DiscoverFilterState;
  onChange: (next: DiscoverFilterState) => void;
  resultCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const availableGenres = useMemo(
    () => getAvailableGenres(recommendations).slice(0, 14),
    [recommendations],
  );

  const active = hasActiveFilters(filters);

  function toggleGenre(genre: string) {
    const genres = filters.genres.includes(genre)
      ? filters.genres.filter((g) => g !== genre)
      : [...filters.genres, genre];
    onChange({ ...filters, genres });
  }

  function toggleDecade(decade: QuizDecade) {
    const decades = filters.decades.includes(decade)
      ? filters.decades.filter((d) => d !== decade)
      : [...filters.decades, decade];
    onChange({ ...filters, decades });
  }

  function reset() {
    onChange(DEFAULT_DISCOVER_FILTERS);
  }

  return (
    <div className="space-y-4 px-4 sm:px-[max(1rem,calc((100vw-72rem)/2+1rem))]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            type="search"
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Search artist or album..."
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className={cn("gap-2", active && "border-violet-600/50 text-violet-300")}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {active && (
              <Badge className="bg-violet-600/30 text-violet-200">
                {[
                  filters.genres.length,
                  filters.decades.length,
                  filters.deepCutOnly ? 1 : 0,
                  filters.minRating ? 1 : 0,
                  filters.sort !== "best_match" ? 1 : 0,
                  filters.search ? 1 : 0,
                ].reduce((a, b) => a + b, 0)}
              </Badge>
            )}
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")}
            />
          </Button>
          {active && (
            <Button variant="ghost" size="sm" onClick={reset} className="gap-1 text-zinc-400">
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm text-zinc-500">
        Showing {resultCount} of {recommendations.length} albums
      </p>

      {expanded && (
        <div className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Sort by
              </span>
              <Select
                value={filters.sort}
                onChange={(e) =>
                  onChange({ ...filters, sort: e.target.value as SortOption })
                }
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Min community rating
              </span>
              <Select
                value={filters.minRating ?? ""}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    minRating: e.target.value ? Number(e.target.value) : null,
                  })
                }
              >
                {RATING_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value ?? ""}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          {availableGenres.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Genre
              </span>
              <div className="flex flex-wrap gap-2">
                {availableGenres.map((genre) => (
                  <FilterPill
                    key={genre}
                    active={filters.genres.includes(genre)}
                    onClick={() => toggleGenre(genre)}
                  >
                    {genre}
                  </FilterPill>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Decade
            </span>
            <div className="flex flex-wrap gap-2">
              {QUIZ_DECADES.map((decade) => (
                <FilterPill
                  key={decade}
                  active={filters.decades.includes(decade)}
                  onClick={() => toggleDecade(decade)}
                >
                  {decade}
                </FilterPill>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-800 px-3 py-2.5">
            <Checkbox
              checked={filters.deepCutOnly}
              onChange={(e) =>
                onChange({ ...filters, deepCutOnly: e.target.checked })
              }
            />
            <div>
              <p className="text-sm font-medium text-zinc-200">Deep cuts only</p>
              <p className="text-xs text-zinc-500">
                Lesser-known pressings and lower-profile picks
              </p>
            </div>
          </label>
        </div>
      )}
    </div>
  );
}
