"use client";

import { WishlistButton } from "@/components/album/wishlist-button";
import { ReserveWithCreditsButton } from "@/components/album/reserve-with-credits-button";
import { Button } from "@/components/ui/button";
import { creditsToUsd, formatUsd } from "@/lib/commerce/pricing";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export function AlbumActions({
  discogsReleaseId,
  title,
  artist,
  coverUrl,
  year,
  creditCost,
  lowestPriceUsd,
  numForSale,
  signedIn,
  discogsUrl,
  spotifyUrl,
  inWishlist,
  forSale,
  compact = false,
}: {
  discogsReleaseId: number;
  title: string;
  artist: string;
  coverUrl: string | null;
  year: number | null;
  creditCost: number;
  lowestPriceUsd: number | null;
  numForSale: number;
  signedIn: boolean;
  discogsUrl: string;
  spotifyUrl: string | null;
  inWishlist: boolean;
  forSale: boolean;
  compact?: boolean;
}) {
  const size = compact ? "sm" : "md";
  const showReserveHelp = !compact && numForSale > 0;

  return (
    <div className={cn(compact ? "w-full" : "space-y-3")}>
      <div className={cn("flex flex-wrap items-center gap-2", compact && "w-full justify-center")}>
        {forSale && (
          <a href={discogsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex">
            <Button size={size} className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Shop on Discogs
            </Button>
          </a>
        )}
        <ReserveWithCreditsButton
          discogsReleaseId={discogsReleaseId}
          title={title}
          artist={artist}
          creditCost={creditCost}
          numForSale={numForSale}
          compact={compact}
        />
        <WishlistButton
          discogsReleaseId={discogsReleaseId}
          title={title}
          artist={artist}
          coverUrl={coverUrl}
          year={year}
          initialInWishlist={inWishlist}
          compact={compact}
        />
        {spotifyUrl && (
          <a
            href={spotifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex"
          >
            <Button variant="outline" size={size} className="gap-2">
              <ExternalLink className="h-4 w-4" />
              {!compact && "Listen on Spotify"}
            </Button>
          </a>
        )}
      </div>

      {showReserveHelp && (
        <div className="space-y-1 text-xs">
          {lowestPriceUsd && (
            <p className="text-muted">
              ≈ {formatUsd(creditsToUsd(creditCost))} concierge fee · vinyl from{" "}
              {formatUsd(lowestPriceUsd)} on Discogs
            </p>
          )}
          {!signedIn && (
            <p className="text-warning">Sign in with Spotify to earn free credits</p>
          )}
          <a
            href={discogsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-accent hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Or browse all listings on Discogs
          </a>
        </div>
      )}
    </div>
  );
}
