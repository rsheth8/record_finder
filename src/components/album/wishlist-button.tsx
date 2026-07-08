"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MarketplaceBadge } from "@/components/album/marketplace-badge";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/commerce/pricing";
import { spring } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Heart, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function WishlistButton({
  discogsReleaseId,
  title,
  artist,
  coverUrl,
  year,
  initialInWishlist,
  compact = false,
}: {
  discogsReleaseId: number;
  title: string;
  artist: string;
  coverUrl: string | null;
  year: number | null;
  initialInWishlist: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const { showToast } = useToast();
  const [inWishlist, setInWishlist] = useState(initialInWishlist);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (!session) {
      router.push("/");
      showToast("Connect Spotify to save records to your wishlist", "info");
      return;
    }

    setLoading(true);
    if (inWishlist) {
      await fetch(`/api/wishlist?discogsReleaseId=${discogsReleaseId}`, {
        method: "DELETE",
      });
      setInWishlist(false);
      showToast("Removed from wishlist", "info");
    } else {
      await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discogsReleaseId,
          title,
          artist,
          coverUrl,
          year,
        }),
      });
      setInWishlist(true);
      showToast("Added to wishlist", "success");
    }
    setLoading(false);
    router.refresh();
  }

  return (
    <Button
      variant={inWishlist ? "primary" : "outline"}
      size={compact ? "sm" : "md"}
      onClick={toggle}
      disabled={loading}
      className="gap-2"
    >
      <Heart className={cn("h-4 w-4", inWishlist && "fill-current")} />
      {!compact && (inWishlist ? "In Wishlist" : "Add to Wishlist")}
    </Button>
  );
}

export function WishlistRemoveButton({
  discogsReleaseId,
}: {
  discogsReleaseId: number;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function remove() {
    setLoading(true);
    await fetch(`/api/wishlist?discogsReleaseId=${discogsReleaseId}`, {
      method: "DELETE",
    });
    setLoading(false);
    showToast("Removed from wishlist", "info");
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={remove} disabled={loading}>
      Remove
    </Button>
  );
}

function PriceDropBadge({ from }: { from: number }) {
  const reducedMotion = useReducedMotion();

  const badge = (
    <Badge variant="success" className="gap-1 shadow-[var(--shadow-glow)]">
      <TrendingDown className="h-3 w-3" />
      Down from {formatUsd(from)}
    </Badge>
  );

  if (reducedMotion) return badge;

  // Good news deserves a little fanfare: pop in just after the card settles.
  return (
    <motion.span
      className="inline-flex"
      initial={{ opacity: 0, scale: 0.6, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ ...spring, delay: 0.35 }}
    >
      {badge}
    </motion.span>
  );
}

export function WishlistCard({
  item,
}: {
  item: {
    discogsReleaseId: number;
    title: string;
    artist: string;
    coverUrl: string | null;
    year: number | null;
    priceDrop?: { from: number; to: number } | null;
  };
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-surface/60 p-4 transition-colors duration-200 hover:border-accent/30">
      <div className="poster-sleeve relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-elevated">
        {item.coverUrl ? (
          <Image
            src={item.coverUrl}
            alt={item.title}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted">
            <Heart className="h-6 w-6 opacity-40" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <Link
          href={`/album/${item.discogsReleaseId}`}
          className="focus-ring block truncate rounded-sm font-medium text-foreground transition-colors hover:text-accent"
        >
          {item.title}
        </Link>
        <p className="text-sm text-muted">
          {item.artist}
          {item.year ? ` · ${item.year}` : ""}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <MarketplaceBadge discogsReleaseId={item.discogsReleaseId} />
          {item.priceDrop && <PriceDropBadge from={item.priceDrop.from} />}
        </div>
      </div>
      <WishlistRemoveButton discogsReleaseId={item.discogsReleaseId} />
    </div>
  );
}
