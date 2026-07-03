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
  hasContentFilters,
  type DiscoverFilterState,
  type FormatOption,
  type SortOption,
} from "@/lib/recommendations/filter";
import { QUIZ_DECADES, type QuizDecade, type Recommendation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Search, SlidersHorizontal, X } from "lucide-react";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "best_match", label: "Best match" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "highest_rated", label: "Highest rated" },
  { value: "price_low", label: "Price: low to high" },
  { value: "artist_az", label: "Artist A–Z" },
];

const RATING_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Any rating" },
  { value: 3, label: "3+ stars" },
  { value: 3.5, label: "3.5+ stars" },
  { value: 4, label: "4+ stars" },
];

const PRICE_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Any price" },
  { value: 15, label: "Under $15" },
  { value: 25, label: "Under $25" },
  { value: 50, label: "Under $50" },
];

const FORMAT_OPTIONS: { value: FormatOption; label: string }[] = [
  { value: "all", label: "All" },
  { value: "albums", label: "Albums" },
  { value: "singles", label: "Singles / EPs" },
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
          ? "border-accent bg-accent-muted text-accent"
          : "border-border text-muted hover:border-accent/50 hover:text-foreground",
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

  const active = hasContentFilters(filters);
  const activeCount = [
    filters.genres.length,
    filters.decades.length,
    filters.deepCutOnly ? 1 : 0,
    filters.minRating ? 1 : 0,
    filters.search ? 1 : 0,
    filters.forSaleOnly ? 1 : 0,
    filters.maxPrice ? 1 : 0,
    filters.format !== "all" ? 1 : 0,
    filters.fairValueOnly ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

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
    <div className="sticky top-16 z-20 space-y-3 border-b border-border-subtle bg-[var(--color-nav-bg)] py-3 backdrop-blur-md sm:rounded-xl sm:border sm:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Search artist or album..."
            className="py-2.5 pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className={cn("gap-2", active && "border-accent/50 text-accent")}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {active && (
              <Badge variant="accent">{activeCount}</Badge>
            )}
          </Button>
          {active && (
            <Button variant="ghost" size="sm" onClick={reset} className="gap-1 text-muted">
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm text-muted">
        Showing {resultCount} of {recommendations.length} albums
      </p>

      {expanded && (
        <div className="space-y-5 rounded-xl border border-border bg-surface p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block space-y-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
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
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
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

            <label className="block space-y-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                Max price
              </span>
              <Select
                value={filters.maxPrice ?? ""}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    maxPrice: e.target.value ? Number(e.target.value) : null,
                  })
                }
              >
                {PRICE_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value ?? ""}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Format
            </span>
            <div className="flex flex-wrap gap-2">
              {FORMAT_OPTIONS.map((opt) => (
                <FilterPill
                  key={opt.value}
                  active={filters.format === opt.value}
                  onClick={() => onChange({ ...filters, format: opt.value })}
                >
                  {opt.label}
                </FilterPill>
              ))}
            </div>
          </div>

          {availableGenres.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
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
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
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

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5">
              <Checkbox
                checked={filters.deepCutOnly}
                onChange={(e) =>
                  onChange({ ...filters, deepCutOnly: e.target.checked })
                }
              />
              <div>
                <p className="text-sm font-medium text-foreground">Deep cuts only</p>
                <p className="text-xs text-muted">
                  Lesser-known pressings and lower-profile picks
                </p>
              </div>
            </label>

            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5">
              <Checkbox
                checked={filters.forSaleOnly}
                onChange={(e) =>
                  onChange({ ...filters, forSaleOnly: e.target.checked })
                }
              />
              <div>
                <p className="text-sm font-medium text-foreground">For sale only</p>
                <p className="text-xs text-muted">
                  Only show pressings with active Discogs listings
                </p>
              </div>
            </label>

            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5">
              <Checkbox
                checked={filters.fairValueOnly}
                onChange={(e) =>
                  onChange({ ...filters, fairValueOnly: e.target.checked })
                }
              />
              <div>
                <p className="text-sm font-medium text-foreground">Good value only</p>
                <p className="text-xs text-muted">
                  High demand, priced low compared to your other picks
                </p>
              </div>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
