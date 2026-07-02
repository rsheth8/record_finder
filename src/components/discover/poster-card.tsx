"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import type { Recommendation } from "@/lib/types";
import { formatUsd } from "@/lib/commerce/pricing";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Disc3, ExternalLink, ShoppingBag, Star } from "lucide-react";

export function PosterCard({
  rec,
  className,
  variant = "grid",
  isDragging = false,
  featured = false,
}: {
  rec: Recommendation;
  className?: string;
  variant?: "carousel" | "grid";
  isDragging?: boolean;
  featured?: boolean;
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

  return (
    <Wrapper className={cn("group relative shrink-0", className)} {...motionProps}>
      <Link
        href={`/album/${rec.discogsReleaseId}`}
        onClick={(e) => {
          if (isDragging) e.preventDefault();
        }}
        className={cn(
          "poster-sleeve relative block select-none overflow-hidden rounded-lg bg-surface",
          "origin-center transition-[box-shadow] duration-300 ease-out",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
          variant === "carousel"
            ? "hover:z-20 hover:shadow-[var(--shadow-poster-hover)]"
            : "hover:shadow-[var(--shadow-poster-hover)]",
          featured && "ring-2 ring-accent/40",
        )}
        draggable={false}
      >
        <div className="relative aspect-[2/3] w-full">
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

          {priceLabel && (
            <div className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-foreground shadow-sm backdrop-blur-sm">
              <ShoppingBag className="h-3 w-3 text-success" />
              {priceLabel}
            </div>
          )}

          {rec.communityRating && rec.communityRating >= 3.5 && (
            <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-warning backdrop-blur-sm">
              <Star className="h-3 w-3 fill-warning text-warning" />
              {rec.communityRating.toFixed(1)}
            </div>
          )}

          <div className="poster-overlay-gradient absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />

          <div className="absolute inset-x-0 bottom-0 p-3 poster-overlay-text">
            <p className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
              {rec.title}
            </p>
            <p className="mt-1 truncate text-xs text-muted">
              {rec.artist}
              {rec.year ? ` · ${rec.year}` : ""}
            </p>
            {rec.reasons[0] && (
              <p className="mt-1.5 line-clamp-2 text-[10px] leading-snug text-muted">
                {rec.reasons[0]}
              </p>
            )}
          </div>

          <div className="poster-title-below hidden px-1 pt-2">
            <p className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
              {rec.title}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted">
              {rec.artist}
              {rec.year ? ` · ${rec.year}` : ""}
            </p>
          </div>

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
      </Link>
    </Wrapper>
  );
}
