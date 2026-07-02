"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MarketplaceBadge } from "@/components/album/marketplace-badge";
import { Heart } from "lucide-react";
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

export function WishlistCard({
  item,
}: {
  item: {
    discogsReleaseId: number;
    title: string;
    artist: string;
    coverUrl: string | null;
    year: number | null;
  };
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-surface/60 p-4 transition-colors hover:border-accent/30">
      <div className="poster-sleeve relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-elevated">
        {item.coverUrl ? (
          <Image
            src={item.coverUrl}
            alt={item.title}
            fill
            className="object-cover"
            unoptimized
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <a
          href={`/album/${item.discogsReleaseId}`}
          className="block truncate font-medium text-foreground hover:text-accent"
        >
          {item.title}
        </a>
        <p className="text-sm text-muted">
          {item.artist}
          {item.year ? ` · ${item.year}` : ""}
        </p>
        <div className="mt-1">
          <MarketplaceBadge discogsReleaseId={item.discogsReleaseId} />
        </div>
      </div>
      <WishlistRemoveButton discogsReleaseId={item.discogsReleaseId} />
    </div>
  );
}
