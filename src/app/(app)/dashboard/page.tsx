import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import {
  getReasonCitationRate,
  getFeedbackLikeRateBySource,
  getSyncToFirstRecommendationStats,
  getSearchToReservationFunnel,
  getEmailToReservationFunnel,
} from "@/lib/db/queries";
import { StatTile } from "@/components/dashboard/stat-tile";
import { FunnelDisplay } from "@/components/dashboard/funnel-display";

export const dynamic = "force-dynamic";

function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = ms / 60_000;
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  return `${(minutes / 60).toFixed(1)}h`;
}

/** Internal-only — see src/lib/admin.ts. A non-matching visitor (including a
 * guest) gets a plain 404, not a "not authorized" message, so the route's
 * existence isn't advertised. */
export default async function DashboardPage() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    notFound();
  }

  const [reasonCitation, feedbackLike, syncToFirstRec, searchFunnel, emailFunnel] =
    await Promise.all([
      getReasonCitationRate(),
      getFeedbackLikeRateBySource(),
      getSyncToFirstRecommendationStats(),
      getSearchToReservationFunnel(),
      getEmailToReservationFunnel(),
    ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Metrics</h1>
        <p className="mt-2 text-muted">
          Success metrics from the roadmap, computed live from the analytics event log.
        </p>
      </div>

      <section>
        <h2 className="font-display text-lg font-semibold text-foreground">
          Reason citation rate
        </h2>
        <p className="text-sm text-muted">
          % of recommendations whose surfaced reasons cited saved/recent/core taste.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <StatTile label="Spotify-connected" value={formatRate(reasonCitation.spotifyConnected)} />
          <StatTile label="Quiz-only" value={formatRate(reasonCitation.quizOnly)} />
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-foreground">
          Feedback like rate
        </h2>
        <p className="text-sm text-muted">Share of feedback signals that were a &ldquo;like.&rdquo;</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <StatTile label="Spotify-connected" value={formatRate(feedbackLike.spotifyConnected)} />
          <StatTile label="Quiz-only" value={formatRate(feedbackLike.quizOnly)} />
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-foreground">
          Time to first recommendation after sync
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <StatTile label="Median" value={formatDuration(syncToFirstRec.medianMs)} />
          <StatTile label="Sample size" value={String(syncToFirstRec.sampleSize)} />
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-foreground">Funnels</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <FunnelDisplay title="Search → reservation" funnel={searchFunnel} />
          <FunnelDisplay title="Price-drop email → reservation" funnel={emailFunnel} />
        </div>
      </section>
    </div>
  );
}
