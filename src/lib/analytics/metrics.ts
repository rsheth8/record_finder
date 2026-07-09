/** Pure aggregation over raw analytics_events rows — no DB access, so these
 * are testable without mocking a database. See `db/queries.ts`'s
 * `getAnalyticsEvents()` for the fetch side and `logEvent()` for how rows get
 * written in the first place. */
export interface AnalyticsEventRow {
  userId: string;
  type: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface ReasonCitationRate {
  /** Fraction (0-1) of Spotify-connected-path recommendations whose reasons
   * cited saved/recent/core taste. Null when there's no data yet. */
  spotifyConnected: number | null;
  quizOnly: number | null;
}

/** "% of recommendations with specific reasons citing saved/recent/core
 * taste" — from the roadmap's success metrics. Reads aggregate counts logged
 * per generation batch (`recommendations_generated` events) rather than
 * per-recommendation rows, since logging one event per pick would be a lot of
 * write volume for a number that's just as accurate as a batch total. */
export function computeReasonCitationRate(
  events: AnalyticsEventRow[],
): ReasonCitationRate {
  const generated = events.filter((e) => e.type === "recommendations_generated");
  const rateFor = (source: string): number | null => {
    const rows = generated.filter((e) => e.metadata.source === source);
    const total = rows.reduce((sum, r) => sum + Number(r.metadata.count ?? 0), 0);
    const withReason = rows.reduce(
      (sum, r) => sum + Number(r.metadata.withSpotifyReason ?? 0),
      0,
    );
    return total > 0 ? withReason / total : null;
  };
  return {
    spotifyConnected: rateFor("spotify"),
    quizOnly: rateFor("quiz-only"),
  };
}

export interface FeedbackLikeRate {
  spotifyConnected: number | null;
  quizOnly: number | null;
}

/** "Feedback like rate: Spotify-connected vs quiz-only" — from the roadmap's
 * success metrics. */
export function computeFeedbackLikeRate(events: AnalyticsEventRow[]): FeedbackLikeRate {
  const feedback = events.filter((e) => e.type === "feedback_given");
  const rateFor = (connected: boolean): number | null => {
    const rows = feedback.filter((e) => e.metadata.connected === connected);
    if (rows.length === 0) return null;
    const likes = rows.filter((e) => e.metadata.signal === "like").length;
    return likes / rows.length;
  };
  return { spotifyConnected: rateFor(true), quizOnly: rateFor(false) };
}

export interface SyncToFirstRecommendationStats {
  medianMs: number | null;
  sampleSize: number;
}

/** "Sync completion rate and time-to-first-recommendation after connect" —
 * from the roadmap's success metrics. Sync *completion rate* isn't a
 * meaningful ratio without a denominator of sync *attempts* that failed
 * silently before logging existed, so this focuses on the time-to-first-pick
 * half: per user, the gap between their first successful Spotify sync and
 * their first Spotify-seeded recommendation batch. */
export function computeSyncToFirstRecommendation(
  events: AnalyticsEventRow[],
): SyncToFirstRecommendationStats {
  const firstSyncByUser = new Map<string, Date>();
  const firstRecByUser = new Map<string, Date>();

  for (const e of events) {
    if (e.type === "spotify_sync_completed") {
      const existing = firstSyncByUser.get(e.userId);
      if (!existing || e.createdAt < existing) firstSyncByUser.set(e.userId, e.createdAt);
    } else if (e.type === "recommendations_generated" && e.metadata.source === "spotify") {
      const existing = firstRecByUser.get(e.userId);
      if (!existing || e.createdAt < existing) firstRecByUser.set(e.userId, e.createdAt);
    }
  }

  const diffs: number[] = [];
  for (const [userId, syncAt] of firstSyncByUser) {
    const recAt = firstRecByUser.get(userId);
    if (recAt && recAt.getTime() >= syncAt.getTime()) {
      diffs.push(recAt.getTime() - syncAt.getTime());
    }
  }
  diffs.sort((a, b) => a - b);

  return {
    medianMs: diffs.length > 0 ? diffs[Math.floor(diffs.length / 2)] : null,
    sampleSize: diffs.length,
  };
}

export interface FunnelStage {
  type: string;
  /** Distinct users who reached this stage, counting only those who also
   * reached every prior stage in the funnel. */
  users: number;
}

export interface FunnelResult {
  stages: FunnelStage[];
  /** Conversion rate from stage `i` to stage `i + 1`, one shorter than `stages`. */
  conversionRates: (number | null)[];
}

/** Generic N-stage funnel over distinct users per event type, in the given
 * order — used for both the search (search → click-through → reservation)
 * and email (email click → reservation) funnels from "Recommended next
 * steps", so a third stage can be added later without a new function. */
export function computeFunnel(
  events: AnalyticsEventRow[],
  stageTypes: string[],
): FunnelResult {
  const usersByType = new Map<string, Set<string>>();
  for (const type of stageTypes) {
    usersByType.set(
      type,
      new Set(events.filter((e) => e.type === type).map((e) => e.userId)),
    );
  }

  let carried = usersByType.get(stageTypes[0]) ?? new Set<string>();
  const stages: FunnelStage[] = [{ type: stageTypes[0], users: carried.size }];
  const conversionRates: (number | null)[] = [];

  for (let i = 1; i < stageTypes.length; i++) {
    const stageUsers = usersByType.get(stageTypes[i]) ?? new Set<string>();
    const reached = new Set([...stageUsers].filter((u) => carried.has(u)));
    conversionRates.push(carried.size > 0 ? reached.size / carried.size : null);
    stages.push({ type: stageTypes[i], users: reached.size });
    carried = reached;
  }

  return { stages, conversionRates };
}
