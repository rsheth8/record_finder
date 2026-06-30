"use client";

import { PosterCard } from "@/components/discover/poster-card";
import type { Recommendation } from "@/lib/types";

export function DiscoverGrid({ items }: { items: Recommendation[] }) {
  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 sm:gap-4 sm:px-[max(1rem,calc((100vw-72rem)/2+1rem))] md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((rec) => (
        <PosterCard key={rec.discogsReleaseId} rec={rec} className="w-full" />
      ))}
    </div>
  );
}
