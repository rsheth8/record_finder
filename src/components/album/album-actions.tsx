"use client";

import { WishlistButton } from "@/components/album/wishlist-button";
import { ReserveWithCreditsButton } from "@/components/album/reserve-with-credits-button";
import { Button } from "@/components/ui/button";
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
  return (
    <div className={cn("flex flex-wrap items-center gap-2", compact && "w-full justify-center")}>
      {forSale && (
        <a href={discogsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex">
          <Button size={compact ? "sm" : "lg"} className="gap-2">
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
        lowestPriceUsd={lowestPriceUsd}
        numForSale={numForSale}
        signedIn={signedIn}
        discogsUrl={discogsUrl}
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
          <Button variant="outline" size={compact ? "sm" : "md"} className="gap-2">
            <ExternalLink className="h-4 w-4" />
            {!compact && "Listen on Spotify"}
          </Button>
        </a>
      )}
    </div>
  );
}
