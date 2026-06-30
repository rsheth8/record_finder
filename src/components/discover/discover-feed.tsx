"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CarouselRow } from "@/components/discover/carousel-row";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { groupRecommendations } from "@/lib/recommendations/group";
import type { QuizDecade, QuizGenre, Recommendation } from "@/lib/types";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function DiscoverFeed({
  recommendations: initialRecommendations,
  quizGenres = [],
  quizDecades = [],
  error: initialError,
}: {
  recommendations: Recommendation[];
  quizGenres?: QuizGenre[];
  quizDecades?: QuizDecade[];
  error?: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError ?? null);

  const rows = groupRecommendations(
    initialRecommendations,
    quizGenres,
    quizDecades,
  );

  async function refresh() {
    setLoading(true);
    setError(null);

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

      router.refresh();
    } catch {
      setError("Something went wrong. Check your API keys and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between px-4 sm:px-[max(1rem,calc((100vw-72rem)/2+1rem))]">
        <p className="text-sm text-zinc-400">
          {initialRecommendations.length} album
          {initialRecommendations.length !== 1 ? "s" : ""} with vinyl pressings
        </p>
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

      {loading ? (
        <VinylLoader variant="section" context="discover" />
      ) : rows.length === 0 ? (
        <Card>
          <CardTitle>No recommendations yet</CardTitle>
          <CardDescription className="mt-2">
            Complete the quiz and connect Spotify to generate picks.
          </CardDescription>
        </Card>
      ) : (
        <div className="space-y-10 overflow-x-clip">
          {rows.map((row) => (
            <CarouselRow key={row.id} title={row.title} items={row.items} />
          ))}
        </div>
      )}
    </div>
  );
}
