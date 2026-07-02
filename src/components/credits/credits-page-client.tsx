"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { ThemePicker } from "@/components/theme-picker";
import { FREE_CREDIT_BONUSES } from "@/lib/commerce/free-credits";
import { formatCredits } from "@/lib/commerce/pricing";
import { Loader2, Coins, Gift, Clock } from "lucide-react";
import { SpotifyConnect } from "@/components/spotify-connect";
import { cn } from "@/lib/utils";

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
      {/* Wallet card */}
      <Card glow className="relative overflow-hidden">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-accent-muted blur-2xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-muted">
              <Coins className="h-8 w-8 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted">Your balance</p>
              <p className="font-display text-4xl font-bold text-foreground">
                {formatCredits(initialBalance)}
              </p>
            </div>
          </div>
          <ThemePicker />
        </div>
      </Card>

      {error && <p className="text-sm text-error">{error}</p>}

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Free credits</h2>
        <p className="text-sm text-muted">
          No payment or subscriptions — credits are free to earn and spend on
          record reservations.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {welcomeBonus && (
            <Card>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-accent" />
                {welcomeBonus.name}
              </CardTitle>
              <CardDescription className="mt-2">
                {welcomeBonus.description}
              </CardDescription>
              <p className="mt-4 text-2xl font-bold text-accent">
                {welcomeBonus.credits} credits
              </p>
              <p className="mt-2 text-sm text-muted">
                {hasWelcome
                  ? "Already claimed"
                  : "Granted automatically on your first visit here"}
              </p>
            </Card>
          )}
          {dailyBonus && (
            <Card className={cn(dailyClaimed && "opacity-80")}>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-accent" />
                {dailyBonus.name}
              </CardTitle>
              <CardDescription className="mt-2">
                {dailyBonus.description}
              </CardDescription>
              <p className="mt-4 text-2xl font-bold text-accent">
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
                  <span className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Claimed today
                  </span>
                ) : (
                  "Claim free bonus"
                )}
              </Button>
            </Card>
          )}
        </div>
      </section>

      {initialHistory.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold">History</h2>
          <div className="relative space-y-0 pl-6">
            <div className="absolute bottom-2 left-2 top-2 w-px bg-border" />
            {initialHistory.map((entry) => (
              <div key={entry.id} className="relative pb-4">
                <div className="absolute -left-4 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-accent bg-background" />
                <div className="flex items-center justify-between rounded-lg border border-border bg-surface/60 px-4 py-3 text-sm">
                  <div>
                    <span className="text-foreground">{entry.reason}</span>
                    <p className="text-xs text-muted">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "font-semibold",
                      entry.delta >= 0 ? "text-success" : "text-warning",
                    )}
                  >
                    {entry.delta >= 0 ? "+" : ""}
                    {entry.delta}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
