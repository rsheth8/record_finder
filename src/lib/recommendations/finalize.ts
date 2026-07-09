import type { Recommendation } from "@/lib/types";

export interface FinalizeWeights {
  /** Taste match — how well the pick fits Spotify listening history, feedback,
   * and community rating (everything in `score` except quiz signals). */
  relevance: number;
  /** Quiz-answer fit — decade, quiz-genre, sub-genre, mood, format, deep-cut
   * appetite, and album-battle preference. Carved out of `relevance` into its
   * own weighted, batch-normalized component so a Spotify-connected user's
   * quiz answers have a guaranteed, visible influence on the final score,
   * instead of being diluted inside one combined raw-score sum where
   * listening-history signals have much higher variance. */
  quizFit: number;
  /** Community rating quality (Bayesian-shrunk). */
  rating: number;
  /** How sought-after the pressing is (Discogs want count). */
  desirability: number;
}

/** Taste match still leads, but quiz fit, community rating, and desirability
 * now shape the ranking so "best match" reflects quality and the user's own
 * stated preferences, not just the raw listening-history match sum. */
export const DEFAULT_FINALIZE_WEIGHTS: FinalizeWeights = {
  relevance: 0.4,
  quizFit: 0.2,
  rating: 0.3,
  desirability: 0.1,
};

/** /5 rating a thin vote count is shrunk toward (roughly the "decent record"
 * mean), and the vote count at which a record's own rating outweighs that prior. */
const RATING_PRIOR = 3.8;
const RATING_CONFIDENCE = 50;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Community rating on a 0–1 scale, Bayesian-shrunk toward a prior so a 4.9 from
 * 20 voters doesn't outrank a 4.6 from thousands. Unrated → the prior. */
export function ratingScore(rec: Recommendation): number {
  const r = rec.communityRating;
  if (r == null) return RATING_PRIOR / 5;
  const votes = Math.max(0, rec.ratingCount ?? 0);
  const shrunk =
    (votes * r + RATING_CONFIDENCE * RATING_PRIOR) / (votes + RATING_CONFIDENCE);
  return clamp01(shrunk / 5);
}

/** Normalizes the per-path raw match score into 0–1 within the batch so the two
 * very different raw scales — rich Spotify sums vs. quiz browse-rank — become
 * comparable. A flat batch maps to a neutral 0.5. */
function relevanceScores(recs: Recommendation[]): number[] {
  const raws = recs.map((r) => r.score);
  const min = Math.min(...raws);
  const max = Math.max(...raws);
  const span = max - min;
  return raws.map((s) => (span > 0 ? (s - min) / span : 0.5));
}

/** Normalizes `quizScore` (pure quiz-answer signals, see the field doc on
 * `Recommendation`) into 0–1 within the batch, same min-max treatment as
 * `relevanceScores`. A candidate with no quiz signal at all (undefined) is
 * treated as 0. A flat batch maps to a neutral 0.5. */
function quizFitScores(recs: Recommendation[]): number[] {
  const raws = recs.map((r) => r.quizScore ?? 0);
  const min = Math.min(...raws);
  const max = Math.max(...raws);
  const span = max - min;
  return raws.map((s) => (span > 0 ? (s - min) / span : 0.5));
}

/** log-scaled want count normalized to 0–1 within the batch — a vinyl-native
 * "how sought-after" signal. Direction depends on the user's stated deep-cut
 * appetite: below this level "desirable" means popular; above it, "desirable"
 * means obscure. Without this split, the desirability term always rewarded
 * popularity — actively fighting a deep-cut lover's own preference, which
 * `quizAffinityAdjustment`/`scoreCandidates` had already baked into `score`
 * (and therefore into the relevance term) in the opposite direction. */
const DEEP_CUT_NEUTRAL_LEVEL = 50;

function desirabilityScores(
  recs: Recommendation[],
  deepCutLevel: number,
): number[] {
  const logs = recs.map((r) => Math.log10(1 + Math.max(0, r.wantCount ?? 0)));
  const max = Math.max(...logs);
  const popularity = logs.map((l) => (max > 0 ? clamp01(l / max) : 0.5));

  // +1 = favor popular (deepCutLevel 0), -1 = favor obscure (deepCutLevel
  // 100), 0 = neutral (deepCutLevel 50 — desirability contributes no
  // directional signal either way).
  const bias = clamp01((100 - deepCutLevel) / 100) * 2 - 1;
  return popularity.map((p) => clamp01(0.5 + bias * (p - 0.5)));
}

/** Post-enrichment re-scoring. Replaces each pick's raw, unbounded, per-path
 * score with a normalized 0–100 blend of taste relevance, community rating, and
 * desirability. The result is interpretable and comparable across the Spotify
 * and quiz-only paths, and drives every "best match" ordering downstream. */
export function finalizeScores(
  recs: Recommendation[],
  deepCutLevel: number = DEEP_CUT_NEUTRAL_LEVEL,
  weights: FinalizeWeights = DEFAULT_FINALIZE_WEIGHTS,
): Recommendation[] {
  if (recs.length === 0) return recs;

  const relevance = relevanceScores(recs);
  const quizFit = quizFitScores(recs);
  const desirability = desirabilityScores(recs, deepCutLevel);
  const total =
    weights.relevance + weights.quizFit + weights.rating + weights.desirability;

  return recs.map((rec, i) => {
    const blended =
      (weights.relevance * relevance[i] +
        weights.quizFit * quizFit[i] +
        weights.rating * ratingScore(rec) +
        weights.desirability * desirability[i]) /
      total;
    return { ...rec, score: Math.round(blended * 100) };
  });
}
