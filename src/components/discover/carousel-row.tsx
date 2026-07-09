"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import AutoScroll from "embla-carousel-auto-scroll";
import type { EmblaOptionsType, EmblaPluginType } from "embla-carousel";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { Recommendation } from "@/lib/types";
import { PosterCard } from "@/components/discover/poster-card";
import { BLEED_PL, BLEED_PR } from "@/lib/layout";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

const CONTENT_INSET = BLEED_PL;
const HEADER_INSET = cn(BLEED_PL, BLEED_PR);

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
  autoScroll = false,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
}: {
  title: string;
  items: Recommendation[];
  bleed?: boolean;
  featured?: boolean;
  rowIndex?: number;
  /** Continuously drift this row (a passive showcase treatment). Pauses on
   * hover / focus / touch and loops seamlessly; fully disabled under
   * `prefers-reduced-motion`. Reserved for a single showcase row (home "Top
   * picks") — deliberately NOT used on the Discover browse rows, which would
   * be motion soup with many drifting at once. */
  autoScroll?: boolean;
  /** Called at most once per scroll-to-end — fetch and append the row's next
   * page. Omit for rows bounded to a fixed batch (e.g. scored rows), where
   * there's nothing more to fetch. */
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const enableAutoScroll = autoScroll && !reducedMotion;

  const [isHovered, setIsHovered] = useState(false);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Looping is required for a seamless continuous drift; without auto-scroll
  // we keep the snap-to-edges behavior (trimSnaps) the browse rows rely on.
  const emblaOptions = useMemo<EmblaOptionsType>(
    () => ({
      loop: enableAutoScroll,
      align: "start",
      dragFree: false,
      containScroll: enableAutoScroll ? false : "trimSnaps",
      slidesToScroll: "auto",
    }),
    [enableAutoScroll],
  );

  const emblaPlugins = useMemo<EmblaPluginType[]>(
    () =>
      enableAutoScroll
        ? [
            AutoScroll({
              speed: 1,
              stopOnInteraction: false,
              stopOnMouseEnter: true,
              stopOnFocusIn: true,
            }),
          ]
        : [],
    [enableAutoScroll],
  );

  const [emblaRef, emblaApi] = useEmblaCarousel(emblaOptions, emblaPlugins);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const updateScrollButtons = useCallback(() => {
    if (!emblaApi) return;
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  // Refs (not state/deps) so this doesn't need to re-subscribe every time
  // hasMore/loadingMore change — the embla listener below is registered once
  // per emblaApi instance and just reads the latest values off these.
  const onLoadMoreRef = useRef(onLoadMore);
  const hasMoreRef = useRef(hasMore);
  const loadingMoreRef = useRef(loadingMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
    hasMoreRef.current = hasMore;
    loadingMoreRef.current = loadingMore;
  });

  const maybeLoadMore = useCallback(() => {
    if (!emblaApi) return;
    if (!emblaApi.canScrollNext() && hasMoreRef.current && !loadingMoreRef.current) {
      onLoadMoreRef.current?.();
    }
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;

    queueMicrotask(updateScrollButtons);
    queueMicrotask(maybeLoadMore);
    emblaApi.on("select", updateScrollButtons);
    emblaApi.on("reInit", updateScrollButtons);
    emblaApi.on("resize", updateScrollButtons);
    emblaApi.on("select", maybeLoadMore);
    emblaApi.on("reInit", maybeLoadMore);

    return () => {
      emblaApi.off("select", updateScrollButtons);
      emblaApi.off("reInit", updateScrollButtons);
      emblaApi.off("select", maybeLoadMore);
      emblaApi.off("reInit", maybeLoadMore);
      emblaApi.off("resize", updateScrollButtons);
    };
  }, [emblaApi, updateScrollButtons, maybeLoadMore]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.reInit();
  }, [emblaApi, items]);

  useEffect(() => {
    if (!emblaApi) return;
    const root = emblaApi.rootNode();

    // Suppress the poster's click navigation only after a real pointer *drag*,
    // measured by pixel travel on the DOM — NOT by Embla's "scroll" event,
    // which fires continuously during auto-scroll and would flag every plain
    // tap on a drifting row as a drag (swallowing the click). Pointer events
    // cover mouse and touch alike.
    const DRAG_THRESHOLD = 8;
    let startX = 0;
    let tracking = false;

    const onPointerDown = (e: PointerEvent) => {
      startX = e.clientX;
      tracking = true;
      setIsDragging(false);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (tracking && Math.abs(e.clientX - startX) > DRAG_THRESHOLD) {
        setIsDragging(true);
      }
    };
    const onPointerEnd = () => {
      tracking = false;
      // Reset after the click that follows pointerup has been dispatched, so
      // the poster's onClick still sees "dragging" for a genuine drag-release.
      window.setTimeout(() => setIsDragging(false), 0);
    };

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", onPointerEnd);
    root.addEventListener("pointercancel", onPointerEnd);

    return () => {
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerEnd);
      root.removeEventListener("pointercancel", onPointerEnd);
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

      <div className={cn("relative", showArrows && "sm:px-12")}>
        {showArrows && canScrollPrev && (
          <button
            type="button"
            onClick={scrollPrev}
            aria-label={`Scroll ${title || "albums"} left`}
            className={cn(
              "absolute left-0 top-1/2 z-30 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full sm:flex",
              "border border-foreground/15 bg-[var(--color-nav-bg)] text-foreground shadow-xl backdrop-blur-md",
              "transition-all duration-200 hover:scale-105 hover:bg-surface-elevated active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100",
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
              "absolute right-0 top-1/2 z-30 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full sm:flex",
              "border border-foreground/15 bg-[var(--color-nav-bg)] text-foreground shadow-xl backdrop-blur-md",
              "transition-all duration-200 hover:scale-105 hover:bg-surface-elevated active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100",
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
            {loadingMore && (
              <div
                className={cn(
                  "flex aspect-[2/3] shrink-0 grow-0 items-center justify-center pr-3 sm:pr-4",
                  cardWidth,
                )}
              >
                <Loader2 className="h-5 w-5 animate-spin text-muted" />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
