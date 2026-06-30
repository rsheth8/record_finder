"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import AutoScroll from "embla-carousel-auto-scroll";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Recommendation } from "@/lib/types";
import { PosterCard } from "@/components/discover/poster-card";
import { cn } from "@/lib/utils";

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
  const [isDragging, setIsDragging] = useState(false);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const reducedMotion = useRef(false);

  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: items.length > 5,
      align: "start",
      dragFree: true,
      containScroll: "trimSnaps",
    },
    [
      AutoScroll({
        speed: 0.65,
        startDelay: 800,
        stopOnInteraction: false,
        stopOnMouseEnter: true,
        playOnInit: true,
      }),
    ],
  );

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const updateScrollButtons = useCallback(() => {
    if (!emblaApi) return;
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    reducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }, []);

  useEffect(() => {
    if (!emblaApi) return;

    updateScrollButtons();
    emblaApi.on("select", updateScrollButtons);
    emblaApi.on("reInit", updateScrollButtons);

    return () => {
      emblaApi.off("select", updateScrollButtons);
      emblaApi.off("reInit", updateScrollButtons);
    };
  }, [emblaApi, updateScrollButtons]);

  useEffect(() => {
    const autoScroll = emblaApi?.plugins()?.autoScroll;
    if (!autoScroll || reducedMotion.current) return;

    if (isHovered || isDragging) {
      autoScroll.stop();
    } else {
      autoScroll.play();
    }
  }, [emblaApi, isHovered, isDragging]);

  const onPointerDown = useCallback(() => setIsDragging(true), []);
  const onPointerUp = useCallback(() => setIsDragging(false), []);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("pointerDown", onPointerDown);
    emblaApi.on("pointerUp", onPointerUp);
    return () => {
      emblaApi.off("pointerDown", onPointerDown);
      emblaApi.off("pointerUp", onPointerUp);
    };
  }, [emblaApi, onPointerDown, onPointerUp]);

  if (items.length === 0) return null;

  return (
    <section
      className="carousel-row group/row relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {title ? (
        <div
          className={cn(
            "mb-3 flex items-end justify-between gap-4",
            bleed && "pr-4 sm:pr-[max(1rem,calc((100vw-72rem)/2+1rem))]",
          )}
        >
          <h2 className="text-lg font-semibold tracking-tight text-zinc-100 sm:text-xl">
            {title}
          </h2>
          <span className="hidden text-xs text-zinc-500 sm:inline">
            {items.length} albums
          </span>
        </div>
      ) : null}

      <div className="relative">
        {canScrollPrev && (
          <button
            type="button"
            onClick={scrollPrev}
            aria-label={`Scroll ${title} left`}
            className={cn(
              "absolute left-0 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full",
              "border border-white/10 bg-black/70 text-white shadow-lg backdrop-blur-sm",
              "opacity-0 transition-all duration-200 group-hover/row:opacity-100",
              "hover:scale-105 hover:bg-black/90 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500",
              bleed ? "left-2 sm:left-[max(0.5rem,calc((100vw-72rem)/2))]" : "left-1",
            )}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {canScrollNext && (
          <button
            type="button"
            onClick={scrollNext}
            aria-label={`Scroll ${title} right`}
            className={cn(
              "absolute right-0 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full",
              "border border-white/10 bg-black/70 text-white shadow-lg backdrop-blur-sm",
              "opacity-0 transition-all duration-200 group-hover/row:opacity-100",
              "hover:scale-105 hover:bg-black/90 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500",
              bleed ? "right-2 sm:right-4" : "right-1",
            )}
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}

        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-zinc-950 via-zinc-950/80 to-transparent sm:w-16",
            bleed && "sm:left-[max(0px,calc((100vw-72rem)/2))]",
          )}
        />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-zinc-950 to-transparent sm:w-20" />

        <div
          ref={emblaRef}
          className={cn(
            "overflow-hidden",
            bleed &&
              "pl-4 sm:pl-[max(1rem,calc((100vw-72rem)/2+1rem))]",
            isDragging ? "cursor-grabbing" : "cursor-grab",
          )}
        >
          <div className="flex touch-pan-y gap-2 sm:gap-3">
            {items.map((rec) => (
              <PosterCard
                key={rec.discogsReleaseId}
                rec={rec}
                className="w-[132px] sm:w-[156px] md:w-[172px] lg:w-[188px]"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
