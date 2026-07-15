"use client";

import Image from "next/image";
import { Disc3, Loader2, Search as SearchIcon } from "lucide-react";
import type { Recommendation } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Autocomplete dropdown of the top matching releases as the user types.
 * Presentational — keyboard state (activeIndex) and selection live in the
 * parent (SearchFeed), which owns the input. Two selectable kinds: a real
 * release (jump straight to its album page) and, always last, a "search for
 * <query>" row that commits the full grid search. */
export function SearchSuggestions({
  query,
  suggestions,
  loading,
  activeIndex,
  onHover,
  onPickRelease,
  onPickSearchAll,
}: {
  query: string;
  suggestions: Recommendation[];
  loading: boolean;
  /** -1 = nothing highlighted; 0..n-1 = a release; n = the "search all" row. */
  activeIndex: number;
  onHover: (index: number) => void;
  onPickRelease: (rec: Recommendation) => void;
  onPickSearchAll: () => void;
}) {
  const searchAllIndex = suggestions.length;

  return (
    <div
      role="listbox"
      aria-label="Search suggestions"
      className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
    >
      {loading && suggestions.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching&hellip;
        </div>
      ) : (
        <ul className="max-h-[22rem] overflow-y-auto py-1">
          {suggestions.map((rec, i) => (
            <li key={rec.discogsReleaseId} role="option" aria-selected={activeIndex === i}>
              <button
                type="button"
                // onMouseDown (not onClick) so it fires before the input's
                // blur closes the dropdown and cancels the click.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPickRelease(rec);
                }}
                onMouseEnter={() => onHover(i)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                  activeIndex === i ? "bg-accent-muted" : "hover:bg-surface-elevated",
                )}
              >
                <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-surface-elevated">
                  {rec.coverUrl ? (
                    <Image
                      src={rec.coverUrl}
                      alt=""
                      fill
                      className="object-cover"
                      unoptimized
                      sizes="40px"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-muted">
                      <Disc3 className="h-5 w-5 opacity-40" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {rec.title}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {rec.artist}
                    {rec.year ? ` · ${rec.year}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}

          <li role="option" aria-selected={activeIndex === searchAllIndex}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onPickSearchAll();
              }}
              onMouseEnter={() => onHover(searchAllIndex)}
              className={cn(
                "flex w-full items-center gap-3 border-t border-border-subtle px-3 py-2.5 text-left transition-colors",
                activeIndex === searchAllIndex ? "bg-accent-muted" : "hover:bg-surface-elevated",
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-accent-muted text-accent">
                <SearchIcon className="h-4 w-4" />
              </span>
              <span className="text-sm text-foreground">
                Search all vinyl for{" "}
                <span className="font-semibold">&ldquo;{query}&rdquo;</span>
              </span>
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
