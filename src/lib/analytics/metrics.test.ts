import { describe, it, expect } from "vitest";
import {
  computeReasonCitationRate,
  computeFeedbackLikeRate,
  computeSyncToFirstRecommendation,
  computeFunnel,
  type AnalyticsEventRow,
} from "@/lib/analytics/metrics";

function event(
  type: string,
  metadata: Record<string, unknown>,
  userId = "u1",
  createdAt = new Date(),
): AnalyticsEventRow {
  return { userId, type, metadata, createdAt };
}

describe("computeReasonCitationRate", () => {
  it("computes the fraction with a spotify-sourced reason per source", () => {
    const events = [
      event("recommendations_generated", { source: "spotify", count: 20, withSpotifyReason: 15 }),
      event("recommendations_generated", { source: "spotify", count: 10, withSpotifyReason: 5 }),
      event("recommendations_generated", { source: "quiz-only", count: 25, withSpotifyReason: 0 }),
    ];
    const rate = computeReasonCitationRate(events);
    expect(rate.spotifyConnected).toBeCloseTo(20 / 30, 5);
    expect(rate.quizOnly).toBe(0);
  });

  it("returns null when there's no data for a source", () => {
    const rate = computeReasonCitationRate([]);
    expect(rate.spotifyConnected).toBeNull();
    expect(rate.quizOnly).toBeNull();
  });
});

describe("computeFeedbackLikeRate", () => {
  it("splits like rate by connected vs quiz-only", () => {
    const events = [
      event("feedback_given", { signal: "like", connected: true }),
      event("feedback_given", { signal: "dislike", connected: true }),
      event("feedback_given", { signal: "like", connected: false }),
      event("feedback_given", { signal: "like", connected: false }),
    ];
    const rate = computeFeedbackLikeRate(events);
    expect(rate.spotifyConnected).toBeCloseTo(0.5, 5);
    expect(rate.quizOnly).toBe(1);
  });

  it("returns null for a bucket with no feedback", () => {
    const rate = computeFeedbackLikeRate([
      event("feedback_given", { signal: "like", connected: true }),
    ]);
    expect(rate.quizOnly).toBeNull();
  });
});

describe("computeSyncToFirstRecommendation", () => {
  it("diffs each user's first sync against their first spotify-path recommendation batch", () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-01T00:00:05Z"); // +5s
    const events = [
      event("spotify_sync_completed", {}, "u1", t0),
      event("recommendations_generated", { source: "spotify" }, "u1", t1),
    ];
    const stats = computeSyncToFirstRecommendation(events);
    expect(stats.sampleSize).toBe(1);
    expect(stats.medianMs).toBe(5000);
  });

  it("ignores a quiz-only generation when computing the spotify-path gap", () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-01T00:00:05Z");
    const events = [
      event("spotify_sync_completed", {}, "u1", t0),
      event("recommendations_generated", { source: "quiz-only" }, "u1", t1),
    ];
    expect(computeSyncToFirstRecommendation(events).sampleSize).toBe(0);
  });

  it("ignores a user with a sync but no recommendation batch yet", () => {
    const events = [event("spotify_sync_completed", {}, "u1")];
    expect(computeSyncToFirstRecommendation(events).sampleSize).toBe(0);
  });
});

describe("computeFunnel", () => {
  it("counts only users who reached every prior stage, in order", () => {
    const events = [
      event("search_performed", {}, "u1"),
      event("search_performed", {}, "u2"),
      event("search_performed", {}, "u3"),
      event("search_result_click", {}, "u1"),
      event("search_result_click", {}, "u2"),
      event("reservation_created", {}, "u1"),
      // u4 reserved without ever searching — shouldn't count toward this funnel.
      event("reservation_created", {}, "u4"),
    ];
    const funnel = computeFunnel(events, [
      "search_performed",
      "search_result_click",
      "reservation_created",
    ]);
    expect(funnel.stages.map((s) => s.users)).toEqual([3, 2, 1]);
    expect(funnel.conversionRates[0]).toBeCloseTo(2 / 3, 5);
    expect(funnel.conversionRates[1]).toBeCloseTo(1 / 2, 5);
  });

  it("returns null conversion when the prior stage is empty", () => {
    const funnel = computeFunnel([], ["a", "b"]);
    expect(funnel.stages.map((s) => s.users)).toEqual([0, 0]);
    expect(funnel.conversionRates[0]).toBeNull();
  });

  it("supports a 2-stage funnel (e.g. email click -> reservation)", () => {
    const events = [
      event("price_drop_email_click", {}, "u1"),
      event("price_drop_email_click", {}, "u2"),
      event("reservation_created", {}, "u1"),
    ];
    const funnel = computeFunnel(events, ["price_drop_email_click", "reservation_created"]);
    expect(funnel.stages.map((s) => s.users)).toEqual([2, 1]);
    expect(funnel.conversionRates).toEqual([0.5]);
  });
});
