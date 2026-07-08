/**
 * Cross-source record matching (SPIKE) — the hard, quality-deciding half of the
 * multi-source offer layer. Pure functions, no I/O, so match quality is unit
 * testable without spending on a paid meta-search API.
 *
 * Strategy: prefer an exact **UPC/GTIN** match (Discogs exposes barcodes in a
 * release's `identifiers`); fall back to fuzzy artist+title+format scoring, with
 * a hard penalty when the candidate is obviously the wrong format (CD/cassette/
 * digital). We never return full confidence without a UPC.
 */

import type { MatchResult, MatchTier, OfferCandidate, ReleaseKey } from "./types";

/** A Discogs release identifier entry (subset of DiscogsRelease.identifiers). */
export interface DiscogsIdentifier {
  type: string;
  value: string;
  description?: string;
}

/**
 * Canonicalize a barcode to a GTIN-13 digit string, or null if it isn't a
 * plausible UPC-A (12) / EAN-13 (13). UPC-A is EAN-13 with an implicit leading
 * zero, so we zero-pad 12→13 and compare in that space.
 */
export function normalizeGtin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 13) return digits;
  if (digits.length === 12) return `0${digits}`;
  return null;
}

/** Pull every valid, de-duplicated GTIN-13 from a release's identifiers. */
export function extractUpcs(identifiers: DiscogsIdentifier[] | undefined): string[] {
  if (!identifiers) return [];
  const out = new Set<string>();
  for (const id of identifiers) {
    // Discogs labels these "Barcode"; occasionally the useful value is only the
    // numeric one (some barcodes are scanned vs. text — both are worth trying).
    if (id.type?.toLowerCase() !== "barcode") continue;
    const gtin = normalizeGtin(id.value);
    if (gtin) out.add(gtin);
  }
  return [...out];
}

const FORMAT_WORDS = new Set([
  "vinyl", "lp", "lps", "record", "records", "12", "7", "10", "45", "33",
  "album", "ep", "reissue", "remaster", "remastered", "pressing", "gatefold",
  "180g", "180gram", "edition",
]);

/** Lowercase, strip diacritics/punctuation, collapse whitespace. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    // Drop Discogs' "(2)" style disambiguation suffixes.
    .replace(/\(\d+\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Content tokens (format/filler words removed) for coverage comparison. */
export function contentTokens(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((t) => t.length > 0 && !FORMAT_WORDS.has(t));
}

/** Fraction of `needle` tokens present in the `haystack` token set (0..1). */
function coverage(needle: string[], haystack: Set<string>): number {
  if (needle.length === 0) return 0;
  let hit = 0;
  for (const t of needle) if (haystack.has(t)) hit++;
  return hit / needle.length;
}

const WRONG_FORMAT = /\b(cd|compact disc|cassette|tape|digital|mp3|flac|streaming|dvd|blu-?ray)\b/i;
const RIGHT_FORMAT = /\b(vinyl|lp|record|gatefold|180\s?-?\s?g)/i;

export function classifyTier(confidence: number): MatchTier {
  if (confidence >= 0.97) return "verified";
  if (confidence >= 0.75) return "likely";
  if (confidence >= 0.5) return "possible";
  return "rejected";
}

/**
 * Score how confident we are that `candidate` is the same record as `key`.
 * Returns confidence 0..1, a tier, and a human-readable reason.
 */
export function scoreMatch(key: ReleaseKey, candidate: OfferCandidate): MatchResult {
  // 1) Exact UPC/GTIN — the gold path.
  const candGtin = normalizeGtin(candidate.upc);
  if (candGtin && key.upcs.includes(candGtin)) {
    return { confidence: 1, tier: "verified", reason: `Exact UPC match (${candGtin})` };
  }

  // 2) Fuzzy artist + title coverage.
  const haystack = new Set(contentTokens(candidate.title));
  const artistTokens = contentTokens(key.artist);
  const albumTokens = contentTokens(key.title);
  const artistCoverage = coverage(artistTokens, haystack);
  const albumCoverage = coverage(albumTokens, haystack);

  // Album title is the more distinctive signal; weight it a bit higher.
  let confidence = 0.55 * albumCoverage + 0.45 * artistCoverage;

  const formatText = `${candidate.title} ${candidate.formatHint ?? ""}`;
  const rightFormat = RIGHT_FORMAT.test(formatText);
  const wrongFormat = WRONG_FORMAT.test(formatText) && !rightFormat;

  if (rightFormat) confidence = Math.min(0.95, confidence + 0.08);
  // A clearly-different format (CD/cassette/digital) is almost certainly not the
  // record we want — cap it hard so it can never outrank a real vinyl offer.
  if (wrongFormat) confidence = Math.min(confidence * 0.45, 0.45);

  confidence = Math.max(0, Math.min(0.95, confidence));

  const parts: string[] = [];
  parts.push(`artist ${(artistCoverage * 100) | 0}%`);
  parts.push(`title ${(albumCoverage * 100) | 0}%`);
  if (rightFormat) parts.push("vinyl-confirmed");
  if (wrongFormat) parts.push("wrong-format-penalized");

  return {
    confidence,
    tier: classifyTier(confidence),
    reason: parts.join(", "),
  };
}
