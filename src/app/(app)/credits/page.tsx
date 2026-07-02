import { auth, isSpotifyConfigured } from "@/lib/auth";
import { CreditsPageClient } from "@/components/credits/credits-page-client";
import { getCreditsForUser } from "@/lib/commerce/credits-service";
import { getCreditHistory } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function CreditsPage() {
  const session = await auth();

  let balance = 0;
  let claimedDailyToday = false;
  let history: {
    id: number;
    delta: number;
    reason: string;
    createdAt: string;
  }[] = [];

  if (session?.user?.id) {
    balance = await getCreditsForUser(session.user.id, session.user.email);
    const rows = await getCreditHistory(session.user.id);
    const today = new Date();
    claimedDailyToday = rows.some(
      (h) =>
        h.reason === "Daily dig bonus" &&
        h.createdAt &&
        h.createdAt.getUTCFullYear() === today.getUTCFullYear() &&
        h.createdAt.getUTCMonth() === today.getUTCMonth() &&
        h.createdAt.getUTCDate() === today.getUTCDate(),
    );
    history = rows.map((r) => ({
      id: r.id,
      delta: r.delta,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Credits</h1>
        <p className="mt-2 text-muted">
          Free credits to reserve vinyl finds. Complete purchase on Discogs when
          ready — no payment required here.
        </p>
      </div>
      <CreditsPageClient
        initialBalance={balance}
        initialHistory={history}
        claimedDailyToday={claimedDailyToday}
        spotifyConfigured={isSpotifyConfigured}
      />
    </div>
  );
}
