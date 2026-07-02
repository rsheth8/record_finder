"use client";

import { useEffect, useState } from "react";
import { formatUsd } from "@/lib/commerce/pricing";
import { ExternalLink } from "lucide-react";

type MarketplaceStats = {
  lowestPrice: number | null;
  currency: string;
  numForSale: number;
  discogsUrl: string;
};

/** Lazily fetches live Discogs marketplace stats for a release and shows a
 * compact price/availability line. Fetched client-side so a long wishlist
 * doesn't block on N rate-limited Discogs calls before first paint. */
export function MarketplaceBadge({ discogsReleaseId }: { discogsReleaseId: number }) {
  const [stats, setStats] = useState<MarketplaceStats | null>(null);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/discogs/marketplace/${discogsReleaseId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: MarketplaceStats) => {
        if (!cancelled) {
          setStats(data);
          setState("done");
        }
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [discogsReleaseId]);

  if (state === "loading") {
    return <span className="text-xs text-muted">Checking Discogs…</span>;
  }
  if (state === "error" || !stats) return null;

  if (stats.numForSale === 0) {
    return <span className="text-xs text-muted">Not currently for sale</span>;
  }

  return (
    <a
      href={stats.discogsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
    >
      {stats.lowestPrice ? `From ${formatUsd(stats.lowestPrice)} · ` : ""}
      {stats.numForSale} for sale
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
