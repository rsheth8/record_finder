"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Recommendation } from "@/lib/types";
import { PosterCard } from "@/components/discover/poster-card";
import { cn } from "@/lib/utils";

const CONTENT_INSET = "pl-4 sm:pl-[max(1rem,calc((100vw-72rem)/2+1rem))]";
const HEADER_INSET = cn(CONTENT_INSET, "pr-4 sm:pr-[max(1rem,calc((100vw-72rem)/2+1rem))]");

export function CarouselRow({
  title,
  items,
  bleed = true,
}: {
  title: string;
  items: Recommendation[];
  bleed?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: "start",
    dragFree: true,
    containScroll: "trimSnaps",
  });

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const updateScrollButtons = useCallback(() => {
    if (!emblaApi) return;
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;

    updateScrollButtons();
    emblaApi.on("select", updateScrollButtons);
    emblaApi.on("reInit", updateScrollButtons);
    emblaApi.on("resize", updateScrollButtons);

    return () => {
      emblaApi.off("select", updateScrollButtons);
      emblaApi.off("reInit", updateScrollButtons);
      emblaApi.off("resize", updateScrollButtons);
    };
  }, [emblaApi, updateScrollButtons]);

  if (items.length === 0) return null;

  const showArrows = canScrollPrev || canScrollNext;

  return (
    <section
      className="carousel-row group/row relative pb-2"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {title ? (
        <div className={cn("mb-4 flex items-end justify-between gap-4", bleed && HEADER_INSET)}>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-100 sm:text-xl">
            {title}
          </h2>
          <span className="text-xs text-zinc-500">{items.length} albums</span>
        </div>
      ) : null}

      <div className="relative">
        {showArrows && canScrollPrev && (
          <button
            type="button"
            onClick={scrollPrev}
            aria-label={`Scroll ${title || "albums"} left`}
            className={cn(
              "absolute top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full sm:h-11 sm:w-11",
              "border border-white/15 bg-zinc-950/85 text-white shadow-xl backdrop-blur-md",
              "transition-all duration-200 hover:scale-105 hover:bg-zinc-900",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500",
              isHovered ? "opacity-100" : "opacity-80",
              bleed ? "left-1 sm:left-[max(0.25rem,calc((100vw-72rem)/2))]" : "left-1",
            )}
          >
            <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        )}

        {showArrows && canScrollNext && (
          <button
            type="button"
            onClick={scrollNext}
            aria-label={`Scroll ${title || "albums"} right`}
            className={cn(
              "absolute top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full sm:h-11 sm:w-11",
              "border border-white/15 bg-zinc-950/85 text-white shadow-xl backdrop-blur-md",
              "transition-all duration-200 hover:scale-105 hover:bg-zinc-900",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500",
              isHovered ? "opacity-100" : "opacity-80",
              bleed ? "right-2 sm:right-4" : "right-1",
            )}
          >
            <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        )}

        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-zinc-950 to-transparent sm:w-14",
            bleed && "sm:left-[max(0px,calc((100vw-72rem)/2))]",
          )}
        />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-zinc-950 to-transparent sm:w-16" />

        <div
          ref={emblaRef}
          className={cn(
            "overflow-hidden py-2",
            bleed && CONTENT_INSET,
            "cursor-grab active:cursor-grabbing",
          )}
        >
          <div className="flex gap-3 sm:gap-4">
            {items.map((rec) => (
              <PosterCard
                key={rec.discogsReleaseId}
                rec={rec}
                className="w-[140px] sm:w-[160px] md:w-[175px] lg:w-[190px]"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
