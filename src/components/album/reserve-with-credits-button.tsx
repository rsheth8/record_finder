"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { formatCredits, creditsToUsd, formatUsd } from "@/lib/commerce/pricing";
import { Loader2, ShoppingBag } from "lucide-react";

export function ReserveWithCreditsButton({
  discogsReleaseId,
  title,
  artist,
  creditCost,
  lowestPriceUsd,
  numForSale,
  signedIn,
}: {
  discogsReleaseId: number;
  title: string;
  artist: string;
  creditCost: number;
  lowestPriceUsd: number | null;
  numForSale: number;
  signedIn: boolean;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (numForSale === 0) {
    return (
      <p className="text-sm text-zinc-500">Not currently for sale on Discogs</p>
    );
  }

  async function handleReserve() {
    if (!session) {
      router.push("/credits");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discogsReleaseId,
          title,
          artist,
          creditsSpent: creditCost,
        }),
      });
      const data = await res.json();

      if (res.status === 402) {
        router.push("/credits");
        return;
      }

      if (!res.ok) {
        throw new Error(data.error ?? "Could not reserve record");
      }

      router.push(`/reservations/${data.reservation.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleReserve} disabled={loading} className="gap-2">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ShoppingBag className="h-4 w-4" />
        )}
        Reserve for {formatCredits(creditCost)}
      </Button>
      {lowestPriceUsd && (
        <p className="text-xs text-zinc-500">
          ≈ {formatUsd(creditsToUsd(creditCost))} concierge fee · est. Discogs price from{" "}
          {formatUsd(lowestPriceUsd)}
        </p>
      )}
      {!signedIn && (
        <p className="text-xs text-amber-400">Sign in with Spotify to earn free credits</p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
