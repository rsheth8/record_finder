"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Recommendation } from "@/lib/types";
import { PosterCard } from "@/components/discover/poster-card";
import { cn } from "@/lib/utils";

const CONTENT_INSET = "pl-4 sm:pl-[max(1rem,calc((100vw-72rem)/2+1rem))]";
const HEADER_INSET = cn(CONTENT_INSET, "pr-4 sm:pr-[max(1rem,calc((100vw-72rem)/2+1rem))]");

const ROW_ACCENT_COLORS = [
  "var(--color-accent)",
  "var(--color-accent-secondary)",
  "var(--color-success)",
  "var(--color-warning)",
];

function getRowAccent(index: number) {
  return ROW_ACCENT_COLORS[index % ROW_ACCENT_COLORS.length];
}

export function CarouselRow({
  title,
  items,
  bleed = true,
  featured = false,
  rowIndex = 0,
}: {
  title: string;
  items: Recommendation[];
  bleed?: boolean;
  featured?: boolean;
  rowIndex?: number;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: "start",
    dragFree: false,
    containScroll: "trimSnaps",
    slidesToScroll: "auto",
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

    queueMicrotask(updateScrollButtons);
    emblaApi.on("select", updateScrollButtons);
    emblaApi.on("reInit", updateScrollButtons);
    emblaApi.on("resize", updateScrollButtons);

    return () => {
      emblaApi.off("select", updateScrollButtons);
      emblaApi.off("reInit", updateScrollButtons);
      emblaApi.off("resize", updateScrollButtons);
    };
  }, [emblaApi, updateScrollButtons]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.reInit();
  }, [emblaApi, items]);

  useEffect(() => {
    if (!emblaApi) return;

    const onPointerDown = () => setIsDragging(false);
    const onScroll = () => setIsDragging(true);
    const onPointerUp = () => {
      window.setTimeout(() => setIsDragging(false), 50);
    };

    emblaApi.on("pointerDown", onPointerDown);
    emblaApi.on("scroll", onScroll);
    emblaApi.on("pointerUp", onPointerUp);

    return () => {
      emblaApi.off("pointerDown", onPointerDown);
      emblaApi.off("scroll", onScroll);
      emblaApi.off("pointerUp", onPointerUp);
    };
  }, [emblaApi]);

  if (items.length === 0) return null;

  const showArrows = canScrollPrev || canScrollNext;
  const cardWidth = featured
    ? "w-[180px] sm:w-[220px] md:w-[250px] lg:w-[280px]"
    : "w-[140px] sm:w-[160px] md:w-[175px] lg:w-[190px]";

  return (
    <section
      className={cn("carousel-row group/row relative pb-2", featured && "pb-4")}
      aria-label={title || "Album carousel"}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {title ? (
        <div className={cn("mb-4 flex items-end justify-between gap-4", bleed && HEADER_INSET)}>
          <div className="flex items-center gap-3">
            <span
              className="row-accent-line shrink-0"
              style={{ background: getRowAccent(rowIndex) }}
            />
            <h2 className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {title}
            </h2>
          </div>
          <span className="text-xs text-muted">{items.length} albums</span>
        </div>
      ) : null}

      <div className={cn("relative", showArrows && "px-11 sm:px-12")}>
        {showArrows && canScrollPrev && (
          <button
            type="button"
            onClick={scrollPrev}
            aria-label={`Scroll ${title || "albums"} left`}
            className={cn(
              "absolute left-0 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full sm:h-11 sm:w-11",
              "border border-foreground/15 bg-[var(--color-nav-bg)] text-foreground shadow-xl backdrop-blur-md",
              "transition-all duration-200 hover:scale-105 hover:bg-surface-elevated",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
              isHovered ? "opacity-100" : "opacity-80",
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
              "absolute right-0 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full sm:h-11 sm:w-11",
              "border border-foreground/15 bg-[var(--color-nav-bg)] text-foreground shadow-xl backdrop-blur-md",
              "transition-all duration-200 hover:scale-105 hover:bg-surface-elevated",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
              isHovered ? "opacity-100" : "opacity-80",
            )}
          >
            <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        )}

        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-background to-transparent sm:w-10",
            !canScrollPrev && "opacity-0",
          )}
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-background to-transparent sm:w-10",
            !canScrollNext && "opacity-0",
          )}
        />

        <div
          ref={emblaRef}
          className={cn(
            "overflow-hidden py-2",
            bleed && CONTENT_INSET,
            "cursor-grab active:cursor-grabbing",
          )}
        >
          <div className="flex touch-pan-y">
            {items.map((rec) => (
              <div
                key={rec.discogsReleaseId}
                className={cn("min-w-0 shrink-0 grow-0 pr-3 sm:pr-4", cardWidth)}
              >
                <PosterCard
                  rec={rec}
                  variant="carousel"
                  isDragging={isDragging}
                  featured={featured}
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
