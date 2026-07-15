"use client";

import { Clock, Sparkles, TrendingUp, X } from "lucide-react";
import { QUIZ_GENRES, type QuizGenre } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Recognizable, catalog-safe seed queries spanning eras and genres, so a
 * first-time visitor has somewhere to start without knowing what to type. */
const POPULAR_SEARCHES = [
  "Fleetwood Mac",
  "Miles Davis",
  "Radiohead",
  "Kendrick Lamar",
  "Daft Punk",
  "Nina Simone",
  "Talking Heads",
  "Tyler, The Creator",
];

function Chip({
  onClick,
  children,
  className,
}: {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "pressable focus-ring rounded-full border border-border px-3.5 py-1.5 text-sm text-foreground transition-colors hover:border-accent/50 hover:bg-surface-elevated",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Section({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <Icon className="h-3.5 w-3.5 text-accent" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SearchLaunchpad({
  recent,
  tasteGenres,
  onQuery,
  onGenre,
  onClearRecent,
  onRemoveRecent,
}: {
  recent: string[];
  tasteGenres: QuizGenre[];
  onQuery: (query: string) => void;
  onGenre: (genre: QuizGenre) => void;
  onClearRecent: () => void;
  onRemoveRecent: (query: string) => void;
}) {
  return (
    <div className="space-y-8">
      {recent.length > 0 && (
        <Section
          icon={Clock}
          title="Recent searches"
          action={
            <button
              type="button"
              onClick={onClearRecent}
              className="focus-ring rounded text-xs text-muted transition-colors hover:text-foreground"
            >
              Clear all
            </button>
          }
        >
          <div className="flex flex-wrap gap-2">
            {recent.map((query) => (
              <span
                key={query}
                className="group inline-flex items-center gap-1 rounded-full border border-border bg-surface pl-3.5 pr-1.5 py-1 text-sm text-foreground"
              >
                <button
                  type="button"
                  onClick={() => onQuery(query)}
                  className="focus-ring rounded py-0.5 pr-1 transition-colors hover:text-accent"
                >
                  {query}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${query} from recent searches`}
                  onClick={() => onRemoveRecent(query)}
                  className="focus-ring rounded-full p-0.5 text-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </Section>
      )}

      {tasteGenres.length > 0 && (
        <Section icon={Sparkles} title="From your taste profile">
          <div className="flex flex-wrap gap-2">
            {tasteGenres.map((genre) => (
              <Chip
                key={genre}
                onClick={() => onGenre(genre)}
                className="border-accent/40 bg-accent-muted text-accent hover:border-accent"
              >
                {genre} on vinyl
              </Chip>
            ))}
          </div>
        </Section>
      )}

      <Section icon={TrendingUp} title="Popular searches">
        <div className="flex flex-wrap gap-2">
          {POPULAR_SEARCHES.map((query) => (
            <Chip key={query} onClick={() => onQuery(query)}>
              {query}
            </Chip>
          ))}
        </div>
      </Section>

      <Section icon={Sparkles} title="Browse by genre">
        <div className="flex flex-wrap gap-2">
          {QUIZ_GENRES.map((genre) => (
            <Chip key={genre} onClick={() => onGenre(genre)}>
              {genre}
            </Chip>
          ))}
        </div>
      </Section>
    </div>
  );
}
