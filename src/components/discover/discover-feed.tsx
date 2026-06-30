"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RecommendationList } from "@/components/discover/recommendation-card";
import type { Recommendation } from "@/lib/types";
import { Loader2, RefreshCw } from "lucide-react";

export function DiscoverFeed({
  recommendations: initialRecommendations,
  error: initialError,
}: {
  recommendations: Recommendation[];
  error?: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError ?? null);

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh picks
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Finding vinyl you might love...
        </div>
      ) : (
        <RecommendationList recommendations={initialRecommendations} />
      )}
    </div>
  );
}
