import { describe, it, expect } from "vitest";
import {
  finalizeScores,
  ratingScore,
  DEFAULT_FINALIZE_WEIGHTS,
} from "@/lib/recommendations/finalize";
import type { Recommendation } from "@/lib/types";

let idCounter = 1;
function rec(overrides: Partial<Recommendation>): Recommendation {
  return {
    discogsReleaseId: idCounter++,
    title: "Title",
    artist: "Artist",
    year: 1990,
    coverUrl: null,
    genres: [],
    formats: [],
    communityRating: null,
    ratingCount: null,
    wantCount: null,
    haveCount: null,
    spotifyAlbumId: null,
    spotifyUrl: null,
    score: 0,
    reasons: [],
    ...overrides,
  };
}

describe("ratingScore", () => {
  it("shrinks a high rating from few voters toward the prior", () => {
    const thin = ratingScore(rec({ communityRating: 4.9, ratingCount: 5 }));
    const solid = ratingScore(rec({ communityRating: 4.6, ratingCount: 5000 }));
    // With only 5 votes, the 4.9 pick shrinks well below its raw value and
    // toward the ~3.8 prior — a well-voted 4.6 should out-rank it.
    expect(thin).toBeLessThan(solid);
  });

  it("barely shrinks a rating backed by heavy vote volume", () => {
    const score = ratingScore(rec({ communityRating: 4.7, ratingCount: 5000 }));
    expect(score).toBeGreaterThan(0.9);
  });

  it("falls back to the prior for an unrated pick", () => {
    const unrated = ratingScore(rec({ communityRating: null, ratingCount: null }));
    const priorOnly = ratingScore(rec({ communityRating: 3.8, ratingCount: 0 }));
    expect(unrated).toBeCloseTo(priorOnly, 5);
  });
});

describe("finalizeScores", () => {
  it("returns 0-100 integer scores", () => {
    const out = finalizeScores([
      rec({ score: 10, communityRating: 4.9, ratingCount: 5000, wantCount: 20000 }),
      rec({ score: 50, communityRating: 3.5, ratingCount: 100, wantCount: 500 }),
      rec({ score: 90, communityRating: null, ratingCount: null, wantCount: null }),
    ]);
    for (const r of out) {
      expect(Number.isInteger(r.score)).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it("lets a well-rated, well-wanted pick edge out a near-equally relevant one", () => {
    // Min-max normalization always stretches a 2-item batch to the 0/1
    // extremes, so relevance alone would decide a 2-item comparison. A third,
    // clearly-irrelevant filler sets a realistic span so `topRelevance` and
    // `closeRelevance` land close together — the scenario where rating and
    // desirability are meant to matter.
    const topRelevance = rec({
      score: 100,
      communityRating: null,
      ratingCount: null,
      wantCount: 10,
    });
    const closeRelevance = rec({
      score: 95,
      communityRating: 4.8,
      ratingCount: 3000,
      wantCount: 20000,
    });
    const filler = rec({ score: 10, communityRating: null, wantCount: 1 });

    const out = finalizeScores([topRelevance, closeRelevance, filler]);
    const topOut = out.find(
      (r) => r.discogsReleaseId === topRelevance.discogsReleaseId,
    )!;
    const closeOut = out.find(
      (r) => r.discogsReleaseId === closeRelevance.discogsReleaseId,
    )!;
    expect(closeOut.score).toBeGreaterThan(topOut.score);
  });

  it("does not let rating/desirability override a large raw-relevance gap", () => {
    // Relevance is weighted 0.6 by design — it should still lead when the raw
    // match is wildly different, even against a maxed-out quality signal.
    const highlyRelevant = rec({
      score: 100,
      communityRating: null,
      wantCount: 10,
    });
    const irrelevantButLoved = rec({
      score: 0,
      communityRating: 4.9,
      ratingCount: 5000,
      wantCount: 50000,
    });
    const out = finalizeScores([highlyRelevant, irrelevantButLoved]);
    const relevantOut = out.find(
      (r) => r.discogsReleaseId === highlyRelevant.discogsReleaseId,
    )!;
    const lovedOut = out.find(
      (r) => r.discogsReleaseId === irrelevantButLoved.discogsReleaseId,
    )!;
    expect(relevantOut.score).toBeGreaterThan(lovedOut.score);
  });

  it("maps a flat raw-score batch to a neutral relevance component (no div-by-zero)", () => {
    const out = finalizeScores([
      rec({ score: 50, communityRating: 4, ratingCount: 100, wantCount: 100 }),
      rec({ score: 50, communityRating: 4, ratingCount: 100, wantCount: 100 }),
    ]);
    expect(out.every((r) => Number.isFinite(r.score))).toBe(true);
    expect(out[0].score).toBe(out[1].score);
  });

  it("respects custom weights (all-rating collapses ranking to rating alone)", () => {
    const low = rec({ score: 100, communityRating: 3.5, ratingCount: 5000, wantCount: 100 });
    const high = rec({ score: 0, communityRating: 4.9, ratingCount: 5000, wantCount: 100 });
    const out = finalizeScores([low, high], 50, {
      relevance: 0,
      quizFit: 0,
      rating: 1,
      desirability: 0,
    });
    const lowOut = out.find((r) => r.discogsReleaseId === low.discogsReleaseId)!;
    const highOut = out.find((r) => r.discogsReleaseId === high.discogsReleaseId)!;
    expect(highOut.score).toBeGreaterThan(lowOut.score);
  });

  it("is a no-op on an empty list", () => {
    expect(finalizeScores([])).toEqual([]);
  });

  it("default weights sum to 1 (score stays interpretable as a 0-100 blend)", () => {
    const total =
      DEFAULT_FINALIZE_WEIGHTS.relevance +
      DEFAULT_FINALIZE_WEIGHTS.quizFit +
      DEFAULT_FINALIZE_WEIGHTS.rating +
      DEFAULT_FINALIZE_WEIGHTS.desirability;
    expect(total).toBeCloseTo(1, 5);
  });
});

describe("finalizeScores — quizFit", () => {
  // Isolate the quizFit term: zero out every other weight so only quizScore
  // decides ranking.
  const quizFitOnly = { relevance: 0, quizFit: 1, rating: 0, desirability: 0 };

  it("ranks by quizScore, independent of the raw relevance score", () => {
    const highQuiz = rec({ score: 0, quizScore: 50 });
    const lowQuiz = rec({ score: 100, quizScore: 0 });
    const out = finalizeScores([highQuiz, lowQuiz], 50, quizFitOnly);
    const highOut = out.find((r) => r.discogsReleaseId === highQuiz.discogsReleaseId)!;
    const lowOut = out.find((r) => r.discogsReleaseId === lowQuiz.discogsReleaseId)!;
    expect(highOut.score).toBeGreaterThan(lowOut.score);
  });

  it("treats an undefined quizScore as 0", () => {
    const withQuiz = rec({ score: 50, quizScore: 30 });
    const withoutQuiz = rec({ score: 50, quizScore: undefined });
    const out = finalizeScores([withQuiz, withoutQuiz], 50, quizFitOnly);
    const withOut = out.find((r) => r.discogsReleaseId === withQuiz.discogsReleaseId)!;
    const withoutOut = out.find((r) => r.discogsReleaseId === withoutQuiz.discogsReleaseId)!;
    expect(withOut.score).toBeGreaterThan(withoutOut.score);
  });

  it("gives quizFit a real say against a relevance gap under default weights", () => {
    // Same setup as the "does not let rating/desirability override a large
    // raw-relevance gap" test above, but now the trailing pick also has a
    // maxed-out quizScore. Default quizFit weight (0.2) should be enough to
    // meaningfully close the gap versus quizFit being absent entirely.
    const highlyRelevant = rec({ score: 100, quizScore: 0, wantCount: 10 });
    const relevantButQuizMismatch = rec({ score: 0, quizScore: 50, wantCount: 10 });
    const withoutQuizFit = finalizeScores(
      [highlyRelevant, relevantButQuizMismatch],
      50,
    );
    const gapWithout =
      withoutQuizFit.find((r) => r.discogsReleaseId === highlyRelevant.discogsReleaseId)!
        .score -
      withoutQuizFit.find(
        (r) => r.discogsReleaseId === relevantButQuizMismatch.discogsReleaseId,
      )!.score;

    const noQuizWeight = finalizeScores(
      [highlyRelevant, relevantButQuizMismatch],
      50,
      { relevance: 0.6, quizFit: 0, rating: 0.3, desirability: 0.1 },
    );
    const gapWithoutQuizWeight =
      noQuizWeight.find((r) => r.discogsReleaseId === highlyRelevant.discogsReleaseId)!
        .score -
      noQuizWeight.find(
        (r) => r.discogsReleaseId === relevantButQuizMismatch.discogsReleaseId,
      )!.score;

    expect(gapWithout).toBeLessThan(gapWithoutQuizWeight);
  });
});

describe("finalizeScores — deep-cut-aware desirability", () => {
  // Isolate the desirability term: zero out relevance, quizFit, and rating so
  // only want-count-driven desirability decides ranking.
  const desirabilityOnly = { relevance: 0, quizFit: 0, rating: 0, desirability: 1 };

  it("favors popular picks for a mainstream-leaning deepCutLevel", () => {
    const popular = rec({ score: 50, wantCount: 20000 });
    const obscure = rec({ score: 50, wantCount: 5 });
    const out = finalizeScores([popular, obscure], 10, desirabilityOnly);
    const popularOut = out.find((r) => r.discogsReleaseId === popular.discogsReleaseId)!;
    const obscureOut = out.find((r) => r.discogsReleaseId === obscure.discogsReleaseId)!;
    expect(popularOut.score).toBeGreaterThan(obscureOut.score);
  });

  it("inverts to favor obscure picks for a deep-cut-loving deepCutLevel", () => {
    const popular = rec({ score: 50, wantCount: 20000 });
    const obscure = rec({ score: 50, wantCount: 5 });
    const out = finalizeScores([popular, obscure], 90, desirabilityOnly);
    const popularOut = out.find((r) => r.discogsReleaseId === popular.discogsReleaseId)!;
    const obscureOut = out.find((r) => r.discogsReleaseId === obscure.discogsReleaseId)!;
    expect(obscureOut.score).toBeGreaterThan(popularOut.score);
  });

  it("is neutral (no directional signal) at a balanced deepCutLevel", () => {
    const popular = rec({ score: 50, wantCount: 20000 });
    const obscure = rec({ score: 50, wantCount: 5 });
    const out = finalizeScores([popular, obscure], 50, desirabilityOnly);
    expect(out[0].score).toBe(out[1].score);
  });

  it("defaults to a neutral (balanced) deepCutLevel when omitted", () => {
    const popular = rec({ score: 50, wantCount: 20000 });
    const obscure = rec({ score: 50, wantCount: 5 });
    const out = finalizeScores([popular, obscure], undefined, desirabilityOnly);
    expect(out[0].score).toBe(out[1].score);
  });
});
