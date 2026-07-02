"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
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
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (numForSale === 0) {
    return (
      <p className="text-sm text-zinc-500">Not currently for sale on Discogs</p>
    );
  }

  function startReserve() {
    if (!session) {
      router.push("/credits");
      return;
    }
    setError(null);
    setConfirmOpen(true);
  }

  async function handleReserve() {
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
      setConfirmOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={startReserve} disabled={loading} className="gap-2">
        <ShoppingBag className="h-4 w-4" />
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

      <Modal
        open={confirmOpen}
        onClose={() => !loading && setConfirmOpen(false)}
        title="Confirm reservation"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-300">
            Spend <span className="font-semibold text-violet-300">{formatCredits(creditCost)}</span>{" "}
            to hold a concierge queue spot for{" "}
            <span className="font-medium text-zinc-100">{title}</span> by {artist}.
          </p>
          <p className="text-xs text-zinc-500">
            Credits are free and there&apos;s no payment here — you still complete the
            actual purchase on Discogs yourself.
          </p>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleReserve} disabled={loading} className="gap-2">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShoppingBag className="h-4 w-4" />
              )}
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
