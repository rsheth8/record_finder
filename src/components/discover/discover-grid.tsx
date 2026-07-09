"use client";

import { PosterCard } from "@/components/discover/poster-card";
import { StaggerContainer, StaggerItem } from "@/components/motion/stagger";
import { BLEED_PX } from "@/lib/layout";
import { staggerGrid } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Recommendation } from "@/lib/types";

export function DiscoverGrid({ items }: { items: Recommendation[] }) {
  if (items.length === 0) return null;

  return (
    <StaggerContainer
      variants={staggerGrid}
      className={cn(
        BLEED_PX,
        "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
      )}
    >
      {items.map((rec) => (
        <StaggerItem key={rec.discogsReleaseId}>
          <PosterCard rec={rec} className="w-full" />
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
