"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { FREE_CREDIT_BONUSES } from "@/lib/commerce/free-credits";
import { formatCredits } from "@/lib/commerce/pricing";
import { Loader2, Coins, Gift } from "lucide-react";
import { SpotifyConnect } from "@/components/spotify-connect";

export function CreditsPageClient({
  initialBalance,
  initialHistory,
  claimedDailyToday,
  spotifyConfigured,
}: {
  initialBalance: number;
  initialHistory: {
    id: number;
    delta: number;
    reason: string;
    createdAt: string;
  }[];
  claimedDailyToday: boolean;
  spotifyConfigured: boolean;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dailyClaimed, setDailyClaimed] = useState(claimedDailyToday);

  async function claimDaily() {
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch("/api/credits/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bonusId: "daily" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Could not claim bonus");
      }
      setDailyClaimed(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not claim bonus");
    } finally {
      setClaiming(false);
    }
  }

  if (!session) {
    return (
      <Card>
        <CardTitle>Sign in to get free credits</CardTitle>
        <CardDescription className="mt-2 mb-4">
          Connect Spotify to receive a welcome bonus and reserve records.
        </CardDescription>
        <SpotifyConnect spotifyConfigured={spotifyConfigured} />
      </Card>
    );
  }

  const welcomeBonus = FREE_CREDIT_BONUSES.find((b) => b.id === "welcome");
  const dailyBonus = FREE_CREDIT_BONUSES.find((b) => b.id === "daily");
  const hasWelcome = initialHistory.some((h) => h.reason === "Welcome bonus");

  return (
    <div className="space-y-8">
      <Card className="border-violet-800/50 bg-violet-950/20">
        <div className="flex items-center gap-3">
          <Coins className="h-8 w-8 text-violet-400" />
          <div>
            <p className="text-sm text-zinc-400">Your balance</p>
            <p className="text-3xl font-bold text-zinc-50">
              {formatCredits(initialBalance)}
            </p>
          </div>
        </div>
      </Card>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Free credits</h2>
        <p className="text-sm text-zinc-400">
          No payment or subscriptions — credits are free to earn and spend on
          record reservations.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {welcomeBonus && (
            <Card>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-violet-400" />
                {welcomeBonus.name}
              </CardTitle>
              <CardDescription className="mt-2">
                {welcomeBonus.description}
              </CardDescription>
              <p className="mt-4 text-2xl font-bold text-violet-300">
                {welcomeBonus.credits} credits
              </p>
              <p className="mt-2 text-sm text-zinc-500">
                {hasWelcome ? "Already claimed" : "Granted automatically on your first visit here"}
              </p>
            </Card>
          )}
          {dailyBonus && (
            <Card>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-violet-400" />
                {dailyBonus.name}
              </CardTitle>
              <CardDescription className="mt-2">
                {dailyBonus.description}
              </CardDescription>
              <p className="mt-4 text-2xl font-bold text-violet-300">
                {dailyBonus.credits} credits
              </p>
              <Button
                className="mt-4 w-full"
                onClick={claimDaily}
                disabled={claiming || dailyClaimed}
              >
                {claiming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : dailyClaimed ? (
                  "Claimed today"
                ) : (
                  "Claim free bonus"
                )}
              </Button>
            </Card>
          )}
        </div>
      </section>

      {initialHistory.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">History</h2>
          <div className="space-y-2">
            {initialHistory.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 px-4 py-3 text-sm"
              >
                <span className="text-zinc-300">{entry.reason}</span>
                <span
                  className={
                    entry.delta >= 0 ? "text-emerald-400" : "text-amber-400"
                  }
                >
                  {entry.delta >= 0 ? "+" : ""}
                  {entry.delta}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
