"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import type { Recommendation } from "@/lib/types";
import { formatUsd } from "@/lib/commerce/pricing";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Disc3, ExternalLink, ShoppingBag, Sparkles, Star } from "lucide-react";

/** Max tilt in degrees at the card's edge — kept small so it reads as a
 * physical nudge, not a gimmick. */
const MAX_TILT_DEG = 7;

export function PosterCard({
  rec,
  className,
  variant = "grid",
  isDragging = false,
  featured = false,
  onNavigate,
}: {
  rec: Recommendation;
  className?: string;
  variant?: "carousel" | "grid";
  isDragging?: boolean;
  featured?: boolean;
  /** Fired on a real (non-drag) navigation click — used by callers that want
   * to instrument click-through (e.g. the search results funnel). */
  onNavigate?: (rec: Recommendation) => void;
}) {
  const reducedMotion = useReducedMotion();
  const marketplace = rec.marketplace;
  const forSale = marketplace && marketplace.numForSale > 0;
  const priceLabel =
    forSale && marketplace.lowestPrice
      ? `From ${formatUsd(marketplace.lowestPrice)}`
      : forSale
        ? "For sale"
        : null;

  const Wrapper = reducedMotion ? "div" : motion.div;
  const motionProps = reducedMotion
    ? {}
    : variant === "carousel"
      ? {}
      : {
          whileHover: { scale: 1.03, y: -4 },
          transition: spring,
        };

  // Cursor-tracked tilt on the sleeve itself (not the Wrapper above, which
  // framer-motion already animates for the grid lift/scale) — the two
  // transforms live on different nested elements, so they compose instead of
  // fighting over the same `transform`. Skipped entirely under reduced
  // motion rather than just zeroed, so no pointermove listener/rerender
  // churn runs for users who opted out.
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLAnchorElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      setTilt({ rx: (0.5 - py) * MAX_TILT_DEG * 2, ry: (px - 0.5) * MAX_TILT_DEG * 2 });
    },
    [],
  );
  const handlePointerLeave = useCallback(() => setTilt({ rx: 0, ry: 0 }), []);

  return (
    <Wrapper
      className={cn("group relative shrink-0", className)}
      style={reducedMotion ? undefined : { perspective: 800 }}
      {...motionProps}
    >
      <Link
        href={`/album/${rec.discogsReleaseId}`}
        onClick={(e) => {
          if (isDragging) {
            e.preventDefault();
            return;
          }
          onNavigate?.(rec);
        }}
        onPointerMove={reducedMotion ? undefined : handlePointerMove}
        onPointerLeave={reducedMotion ? undefined : handlePointerLeave}
        className={cn(
          "poster-sleeve relative block select-none overflow-hidden rounded-lg bg-surface",
          "origin-center transition-[box-shadow,transform] duration-150 ease-out",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
          variant === "carousel"
            ? "hover:z-20 hover:shadow-[var(--shadow-poster-hover)]"
            : "hover:shadow-[var(--shadow-poster-hover)]",
          featured && "ring-2 ring-accent/40",
        )}
        style={
          reducedMotion
            ? undefined
            : { transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)` }
        }
        draggable={false}
      >
        <div className="relative aspect-[2/3] w-full">
          {/* The record underneath the sleeve — see .vinyl-peek below. Painted
           * first (bottom of the stack) so the sliding sleeve group covers it
           * at rest and reveals a sliver on hover, tinted from this release's
           * own cover art when available. */}
          <div
            className="vinyl-peek absolute inset-0"
            style={
              rec.coverColor ? ({ "--vinyl-color": rec.coverColor } as React.CSSProperties) : undefined
            }
            aria-hidden
          >
            <div className="vinyl-peek__disc">
              <div className="vinyl-peek__grooves" />
              <div className="vinyl-peek__label" />
            </div>
          </div>

          {/* The sleeve: cover art + its gradient/text overlay, slides down on
           * hover to reveal the record peeking out above it. */}
          <div
            className={cn(
              "absolute inset-0 transition-transform duration-500 ease-out",
              "group-hover:translate-y-[9%] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0",
            )}
          >
            {rec.coverUrl ? (
              <Image
                src={rec.coverUrl}
                alt={`${rec.title} cover`}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                unoptimized
                sizes={featured ? "(max-width: 640px) 200px, 280px" : "(max-width: 640px) 132px, 188px"}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-surface-elevated to-surface text-muted">
                <Disc3 className="h-10 w-10 opacity-40" />
                <span className="text-[11px] font-medium">No cover art</span>
              </div>
            )}

            <div className="absolute inset-0 rounded-lg ring-1 ring-inset ring-foreground/10" />

            <div className="poster-overlay-gradient absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />

            <div className="absolute inset-x-0 bottom-0 p-3 poster-overlay-text">
              <p className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
                {rec.title}
              </p>
              <p className="mt-1 truncate text-xs text-muted">
                {rec.artist}
                {rec.year ? ` · ${rec.year}` : ""}
              </p>
              {rec.reasons.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {rec.reasons.slice(0, 2).map((reason) => (
                    <p key={reason} className="line-clamp-1 text-[10px] leading-snug text-muted">
                      {reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>

          {priceLabel && (
            <div className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-foreground shadow-sm backdrop-blur-sm">
              <ShoppingBag className="h-3 w-3 text-success" />
              {priceLabel}
            </div>
          )}

          {rec.fairValue && (
            <div className="absolute left-2 top-9 flex items-center gap-1 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-success shadow-sm backdrop-blur-sm">
              <Sparkles className="h-3 w-3" />
              Good value
            </div>
          )}

          {rec.communityRating && rec.communityRating >= 3.5 && (
            <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-warning backdrop-blur-sm">
              <Star className="h-3 w-3 fill-warning text-warning" />
              {rec.communityRating.toFixed(1)}
            </div>
          )}

          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-[var(--color-text-inverse)] shadow-lg">
              {forSale ? (
                <>
                  <ExternalLink className="h-3.5 w-3.5" />
                  View & buy
                </>
              ) : (
                "View album"
              )}
            </span>
          </div>
        </div>

        <div className="poster-title-below hidden px-2 pb-2 pt-2">
          <p className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
            {rec.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {rec.artist}
            {rec.year ? ` · ${rec.year}` : ""}
          </p>
        </div>
      </Link>
    </Wrapper>
  );
}
