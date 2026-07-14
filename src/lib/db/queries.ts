import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  tasteProfile,
  spotifySnapshot,
  wishlistItems,
  recommendationCache,
  recommendationFeedback,
  users,
  creditLedger,
  orders,
  quizResponses,
  priceHistory,
  localShops,
  offerCache,
  releaseEnrichmentCache,
  coverColorCache,
  analyticsEvents,
} from "../../../drizzle/schema";
import { db, ensureDb } from "./index";
import { parseJson } from "@/lib/utils";
import { normalizeRecommendations } from "@/lib/recommendations/normalize";
import {
  computeReasonCitationRate,
  computeFeedbackLikeRate,
  computeSyncToFirstRecommendation,
  computeFunnel,
  type AnalyticsEventRow,
} from "@/lib/analytics/metrics";
import type {
  TasteProfileData,
  SpotifyArtist,
  SpotifyAlbum,
  SpotifyTrack,
  SpotifyListeningSnapshot,
  SpotifyRecentlyPlayed,
  SpotifyTopByTerm,
  TasteVector,
  WishlistItem,
  Recommendation,
  AlbumPreference,
  QuizGenre,
  QuizDecade,
  QuizMood,
  FeedbackEntry,
  FeedbackSignal,
  QuizAlbumPreference,
  QuizSubGenres,
  FormatPreference,
  QuizRecognizedArtists,
  ExperienceLevel,
  BirthDecade,
} from "@/lib/types";

export async function getTasteProfileFromDb(
  userId: string,
): Promise<TasteProfileData | null> {
  await ensureDb();
  const row = await db
    .select()
    .from(tasteProfile)
    .where(eq(tasteProfile.userId, userId))
    .get();
  if (!row) return null;

  return {
    genres: parseJson<QuizGenre[]>(row.genres, []),
    decades: parseJson<QuizDecade[]>(row.decades, []),
    moods: parseJson<QuizMood[]>(row.moods, []),
    albumPreference: row.albumPreference as AlbumPreference,
    formatPreference: row.formatPreference as FormatPreference,
    deepCutLevel: row.deepCutLevel,
    experienceLevel: (row.experienceLevel as ExperienceLevel) ?? "casual",
    birthDecade: (row.birthDecade as BirthDecade | null) ?? null,
    completedAt: row.completedAt,
  };
}

export async function saveTasteProfileToDb(
  userId: string,
  data: Omit<TasteProfileData, "completedAt"> & { completed?: boolean },
) {
  await ensureDb();
  const existing = await db
    .select()
    .from(tasteProfile)
    .where(eq(tasteProfile.userId, userId))
    .get();
  const now = new Date();

  const values = {
    userId,
    genres: JSON.stringify(data.genres),
    decades: JSON.stringify(data.decades),
    moods: JSON.stringify(data.moods),
    albumPreference: data.albumPreference,
    formatPreference: data.formatPreference,
    deepCutLevel: data.deepCutLevel,
    experienceLevel: data.experienceLevel,
    birthDecade: data.birthDecade,
    completedAt: data.completed ? now : existing?.completedAt ?? null,
    updatedAt: now,
  };

  await db
    .insert(tasteProfile)
    .values(values)
    .onConflictDoUpdate({ target: tasteProfile.userId, set: values });
}

export type StoredSpotifySnapshot = SpotifyListeningSnapshot & {
  tasteVector: TasteVector | null;
};

const EMPTY_TOP_BY_TERM = <T,>(): SpotifyTopByTerm<T> => ({
  short: [],
  medium: [],
  long: [],
});

function parseJsonArray<T>(value: string, fallback: T[]): T[] {
  const parsed = parseJson<T[] | null>(value, fallback);
  return Array.isArray(parsed) ? parsed : fallback;
}

/** Legacy rows may omit short/medium/long — coerce before any `.length` access. */
function normalizeTopByTerm<T>(
  value: SpotifyTopByTerm<T> | null | undefined,
): SpotifyTopByTerm<T> {
  return {
    short: Array.isArray(value?.short) ? value.short : [],
    medium: Array.isArray(value?.medium) ? value.medium : [],
    long: Array.isArray(value?.long) ? value.long : [],
  };
}

export async function getSpotifySnapshot(
  userId: string,
): Promise<StoredSpotifySnapshot | null> {
  await ensureDb();
  const row = await db
    .select()
    .from(spotifySnapshot)
    .where(eq(spotifySnapshot.userId, userId))
    .get();
  if (!row) return null;

  const topArtistsByTermParsed = normalizeTopByTerm(
    parseJson<SpotifyTopByTerm<SpotifyArtist>>(
      row.topArtistsByTerm,
      EMPTY_TOP_BY_TERM(),
    ),
  );
  const topTracksByTerm = normalizeTopByTerm(
    parseJson<SpotifyTopByTerm<SpotifyTrack>>(
      row.topTracksByTerm,
      EMPTY_TOP_BY_TERM(),
    ),
  );
  const tasteVectorRaw = parseJson<TasteVector | Record<string, never>>(
    row.tasteVector,
    {},
  );
  const tasteVector: TasteVector | null =
    tasteVectorRaw && "derivedAt" in tasteVectorRaw
      ? (tasteVectorRaw as TasteVector)
      : null;

  const legacyTopArtists = parseJsonArray<SpotifyArtist>(row.topArtists, []);
  const topArtistsByTerm =
    topArtistsByTermParsed.medium.length > 0
      ? topArtistsByTermParsed
      : {
          short: legacyTopArtists,
          medium: legacyTopArtists,
          long: legacyTopArtists,
        };

  return {
    topArtists: topArtistsByTerm,
    topTracks: topTracksByTerm,
    savedAlbums: parseJsonArray<SpotifyAlbum>(row.savedAlbums, []),
    savedTracks: parseJsonArray<SpotifyTrack>(row.savedTracks, []),
    recentlyPlayed: parseJsonArray<SpotifyRecentlyPlayed>(
      row.recentlyPlayed,
      [],
    ),
    playlistTracks: parseJsonArray<SpotifyTrack>(row.playlistTracks, []),
    topGenres: parseJsonArray<string>(row.topGenres, []),
    tasteVector,
    fetchedAt: row.fetchedAt,
  };
}

export async function saveSpotifySnapshot(
  userId: string,
  data: SpotifyListeningSnapshot & { tasteVector?: TasteVector | null },
) {
  await ensureDb();
  const topArtists = normalizeTopByTerm(data.topArtists);
  const topTracks = normalizeTopByTerm(data.topTracks);
  const topArtistsMedium = topArtists.medium;
  const topAlbumsFromTracks = deriveTopAlbumsFromTracks(topTracks.medium);

  const values = {
    userId,
    topArtists: JSON.stringify(topArtistsMedium),
    topAlbums: JSON.stringify(topAlbumsFromTracks),
    topGenres: JSON.stringify(data.topGenres),
    topArtistsByTerm: JSON.stringify(topArtists),
    topTracksByTerm: JSON.stringify(topTracks),
    savedAlbums: JSON.stringify(data.savedAlbums ?? []),
    savedTracks: JSON.stringify(data.savedTracks ?? []),
    recentlyPlayed: JSON.stringify(data.recentlyPlayed ?? []),
    playlistTracks: JSON.stringify(data.playlistTracks ?? []),
    tasteVector: JSON.stringify(data.tasteVector ?? {}),
    fetchedAt: data.fetchedAt ?? new Date(),
  };
  await db
    .insert(spotifySnapshot)
    .values(values)
    .onConflictDoUpdate({ target: spotifySnapshot.userId, set: values });
}

function deriveTopAlbumsFromTracks(tracks: SpotifyTrack[]): SpotifyAlbum[] {
  const seen = new Set<string>();
  const albums: SpotifyAlbum[] = [];
  for (const track of tracks) {
    if (seen.has(track.albumId)) continue;
    seen.add(track.albumId);
    albums.push({
      id: track.albumId,
      name: track.albumName,
      artist: track.artist,
      artistId: track.artistId,
      releaseDate: "",
      imageUrl: null,
      spotifyUrl: track.spotifyUrl,
    });
    if (albums.length >= 20) break;
  }
  return albums;
}

const EMPTY_RECOGNIZED_ARTISTS: QuizRecognizedArtists = { owned: [], seenLive: [] };

export async function getQuizResponses(userId: string): Promise<{
  albumPreferences: QuizAlbumPreference[];
  subGenres: QuizSubGenres;
  recognizedArtists: QuizRecognizedArtists;
} | null> {
  await ensureDb();
  const row = await db
    .select()
    .from(quizResponses)
    .where(eq(quizResponses.userId, userId))
    .get();
  if (!row) return null;

  return {
    albumPreferences: parseJson<QuizAlbumPreference[]>(row.albumPreferences, []),
    subGenres: parseJson<QuizSubGenres>(row.subGenres, {}),
    recognizedArtists: parseJson<QuizRecognizedArtists>(
      row.recognizedArtists,
      EMPTY_RECOGNIZED_ARTISTS,
    ),
  };
}

export async function saveQuizResponses(
  userId: string,
  data: {
    albumPreferences: QuizAlbumPreference[];
    subGenres: QuizSubGenres;
    recognizedArtists: QuizRecognizedArtists;
  },
) {
  await ensureDb();
  const values = {
    userId,
    albumPreferences: JSON.stringify(data.albumPreferences),
    subGenres: JSON.stringify(data.subGenres),
    recognizedArtists: JSON.stringify(data.recognizedArtists),
    updatedAt: new Date(),
  };
  await db
    .insert(quizResponses)
    .values(values)
    .onConflictDoUpdate({ target: quizResponses.userId, set: values });
}

export async function getWishlist(userId: string): Promise<WishlistItem[]> {
  await ensureDb();
  const rows = await db
    .select()
    .from(wishlistItems)
    .where(eq(wishlistItems.userId, userId))
    .orderBy(desc(wishlistItems.addedAt))
    .all();

  return rows.map((r) => ({
    id: r.id,
    discogsReleaseId: r.discogsReleaseId,
    title: r.title,
    artist: r.artist,
    coverUrl: r.coverUrl,
    year: r.year,
    notes: r.notes ?? "",
    addedAt: r.addedAt,
    priceAtAdd: r.priceAtAdd,
    lastAlertedPrice: r.lastAlertedPrice,
  }));
}

export async function addToWishlist(
  userId: string,
  item: Omit<WishlistItem, "id" | "addedAt" | "priceAtAdd" | "lastAlertedPrice">,
) {
  await ensureDb();
  await db
    .insert(wishlistItems)
    .values({
      userId,
      discogsReleaseId: item.discogsReleaseId,
      title: item.title,
      artist: item.artist,
      coverUrl: item.coverUrl,
      year: item.year,
      notes: item.notes,
      addedAt: new Date(),
    })
    .onConflictDoNothing();
}

export async function removeFromWishlist(
  userId: string,
  discogsReleaseId: number,
) {
  await ensureDb();
  await db
    .delete(wishlistItems)
    .where(
      and(
        eq(wishlistItems.userId, userId),
        eq(wishlistItems.discogsReleaseId, discogsReleaseId),
      ),
    );
}

export async function isInWishlist(
  userId: string,
  discogsReleaseId: number,
): Promise<boolean> {
  await ensureDb();
  const row = await db
    .select()
    .from(wishlistItems)
    .where(
      and(
        eq(wishlistItems.userId, userId),
        eq(wishlistItems.discogsReleaseId, discogsReleaseId),
      ),
    )
    .get();
  return !!row;
}

export async function getCachedRecommendations(
  userId: string,
): Promise<Recommendation[] | null> {
  await ensureDb();
  const row = await db
    .select()
    .from(recommendationCache)
    .where(eq(recommendationCache.userId, userId))
    .get();

  if (!row || row.expiresAt < new Date()) return null;
  return normalizeRecommendations(parseJsonArray<Recommendation>(row.results, []));
}

/** When the current recommendation cache expires (and picks regenerate on
 * next visit), or null if there's no live cache. A separate, cheap query —
 * skips parsing the (large) results JSON that {@link getCachedRecommendations}
 * needs, since callers just displaying "refreshes in Xm" don't need it. */
export async function getRecommendationCacheExpiry(
  userId: string,
): Promise<Date | null> {
  await ensureDb();
  const row = await db
    .select({ expiresAt: recommendationCache.expiresAt })
    .from(recommendationCache)
    .where(eq(recommendationCache.userId, userId))
    .get();

  if (!row || row.expiresAt < new Date()) return null;
  return row.expiresAt;
}

export async function clearRecommendationCache(userId: string) {
  await ensureDb();
  await db
    .delete(recommendationCache)
    .where(eq(recommendationCache.userId, userId));
}

export async function cacheRecommendations(
  userId: string,
  results: Recommendation[],
) {
  await ensureDb();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

  const values = {
    userId,
    results: JSON.stringify(results),
    expiresAt,
    createdAt: now,
  };

  await db
    .insert(recommendationCache)
    .values(values)
    .onConflictDoUpdate({ target: recommendationCache.userId, set: values });
}

export async function getUserFeedback(userId: string): Promise<FeedbackEntry[]> {
  await ensureDb();
  const rows = await db
    .select()
    .from(recommendationFeedback)
    .where(eq(recommendationFeedback.userId, userId))
    .all();

  return rows.map((r) => ({
    discogsReleaseId: r.discogsReleaseId,
    artist: r.artist,
    signal: r.signal as FeedbackSignal,
  }));
}

export async function getReleaseFeedback(
  userId: string,
  discogsReleaseId: number,
): Promise<FeedbackSignal | null> {
  await ensureDb();
  const row = await db
    .select()
    .from(recommendationFeedback)
    .where(
      and(
        eq(recommendationFeedback.userId, userId),
        eq(recommendationFeedback.discogsReleaseId, discogsReleaseId),
      ),
    )
    .get();
  return row ? (row.signal as FeedbackSignal) : null;
}

export async function setFeedback(
  userId: string,
  params: { discogsReleaseId: number; artist: string; signal: FeedbackSignal },
) {
  await ensureDb();
  const now = new Date();
  await db
    .insert(recommendationFeedback)
    .values({
      userId,
      discogsReleaseId: params.discogsReleaseId,
      artist: params.artist,
      signal: params.signal,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [
        recommendationFeedback.userId,
        recommendationFeedback.discogsReleaseId,
      ],
      set: { artist: params.artist, signal: params.signal, createdAt: now },
    });
}

export async function removeFeedback(userId: string, discogsReleaseId: number) {
  await ensureDb();
  await db
    .delete(recommendationFeedback)
    .where(
      and(
        eq(recommendationFeedback.userId, userId),
        eq(recommendationFeedback.discogsReleaseId, discogsReleaseId),
      ),
    );
}

/** Re-keys a guest's data onto a real account when they sign in. Guest rows are
 * moved to the user id; collisions (per-user-unique tables) prefer the existing
 * account, and the throwaway cache/snapshot are just dropped. Idempotent — a
 * second run finds no guest rows left. */
export async function mergeGuestData(guestId: string, userId: string) {
  await ensureDb();
  if (guestId === userId) return;

  // taste_profile is unique per user: keep the account's own quiz if it has one,
  // otherwise adopt the guest's freshly-completed profile.
  const targetProfile = await db
    .select({ id: tasteProfile.id })
    .from(tasteProfile)
    .where(eq(tasteProfile.userId, userId))
    .get();
  if (targetProfile) {
    await db.delete(tasteProfile).where(eq(tasteProfile.userId, guestId));
  } else {
    await db
      .update(tasteProfile)
      .set({ userId })
      .where(eq(tasteProfile.userId, guestId));
  }

  // Regenerated per real user — no value in migrating cache.
  await db.delete(recommendationCache).where(eq(recommendationCache.userId, guestId));

  // Spotify snapshot: adopt guest's if account has none (e.g. synced before sign-in).
  const targetSnapshot = await db
    .select({ id: spotifySnapshot.id })
    .from(spotifySnapshot)
    .where(eq(spotifySnapshot.userId, userId))
    .get();
  if (targetSnapshot) {
    await db.delete(spotifySnapshot).where(eq(spotifySnapshot.userId, guestId));
  } else {
    await db
      .update(spotifySnapshot)
      .set({ userId })
      .where(eq(spotifySnapshot.userId, guestId));
  }

  // Quiz responses: same collision rule as taste profile.
  const targetQuizResponses = await db
    .select({ id: quizResponses.id })
    .from(quizResponses)
    .where(eq(quizResponses.userId, userId))
    .get();
  if (targetQuizResponses) {
    await db.delete(quizResponses).where(eq(quizResponses.userId, guestId));
  } else {
    await db
      .update(quizResponses)
      .set({ userId })
      .where(eq(quizResponses.userId, guestId));
  }

  // Per-user+release unique tables: move non-colliding rows, drop the rest.
  await mergeWishlist(guestId, userId);
  await mergeFeedback(guestId, userId);
}

async function mergeWishlist(guestId: string, userId: string) {
  const targetIds = new Set(
    (
      await db
        .select({ releaseId: wishlistItems.discogsReleaseId })
        .from(wishlistItems)
        .where(eq(wishlistItems.userId, userId))
        .all()
    ).map((r) => r.releaseId),
  );
  const guestRows = await db
    .select()
    .from(wishlistItems)
    .where(eq(wishlistItems.userId, guestId))
    .all();
  for (const row of guestRows) {
    if (targetIds.has(row.discogsReleaseId)) {
      await db.delete(wishlistItems).where(eq(wishlistItems.id, row.id));
    } else {
      await db.update(wishlistItems).set({ userId }).where(eq(wishlistItems.id, row.id));
    }
  }
}

async function mergeFeedback(guestId: string, userId: string) {
  const targetIds = new Set(
    (
      await db
        .select({ releaseId: recommendationFeedback.discogsReleaseId })
        .from(recommendationFeedback)
        .where(eq(recommendationFeedback.userId, userId))
        .all()
    ).map((r) => r.releaseId),
  );
  const guestRows = await db
    .select()
    .from(recommendationFeedback)
    .where(eq(recommendationFeedback.userId, guestId))
    .all();
  for (const row of guestRows) {
    if (targetIds.has(row.discogsReleaseId)) {
      await db.delete(recommendationFeedback).where(eq(recommendationFeedback.id, row.id));
    } else {
      await db
        .update(recommendationFeedback)
        .set({ userId })
        .where(eq(recommendationFeedback.id, row.id));
    }
  }
}

export async function ensureUser(userId: string, email?: string | null) {
  await ensureDb();
  const existing = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!existing) {
    await db.insert(users).values({
      id: userId,
      email: email ?? null,
      createdAt: new Date(),
    });
  }
}

export async function getCreditBalance(userId: string): Promise<number> {
  await ensureDb();
  const result = await db
    .select({ total: sql<number>`coalesce(sum(${creditLedger.delta}), 0)` })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .get();
  return result?.total ?? 0;
}

export async function addCreditEntry(params: {
  userId: string;
  delta: number;
  reason: string;
}) {
  await ensureDb();
  await db.insert(creditLedger).values({
    userId: params.userId,
    delta: params.delta,
    reason: params.reason,
    createdAt: new Date(),
  });
}

export async function getCreditHistory(userId: string) {
  await ensureDb();
  return db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt))
    .all();
}

/** A reservation: credits spent to hold a concierge queue spot for a Discogs
 * listing. There is no payment lifecycle — the buyer completes the purchase
 * on Discogs themselves. */
export type ReservationRecord = {
  id: number;
  userId: string;
  discogsReleaseId: number;
  title: string;
  artist: string;
  creditsSpent: number;
  discogsUrl: string;
  createdAt: Date;
};

export async function createReservation(params: {
  userId: string;
  discogsReleaseId: number;
  title: string;
  artist: string;
  creditsSpent: number;
  discogsUrl: string;
}): Promise<ReservationRecord> {
  await ensureDb();
  const createdAt = new Date();
  const result = await db
    .insert(orders)
    .values({
      userId: params.userId,
      discogsReleaseId: params.discogsReleaseId,
      title: params.title,
      artist: params.artist,
      creditsSpent: params.creditsSpent,
      discogsUrl: params.discogsUrl,
      createdAt,
    })
    .returning();

  if (result[0]) return result[0] as ReservationRecord;

  const row = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, params.userId))
    .orderBy(desc(orders.id))
    .get();

  return row as ReservationRecord;
}

export async function getReservation(
  reservationId: number,
  userId: string,
): Promise<ReservationRecord | null> {
  await ensureDb();
  const row = await db
    .select()
    .from(orders)
    .where(eq(orders.id, reservationId))
    .get();
  if (!row || row.userId !== userId) return null;
  return row as ReservationRecord;
}

export async function getUserReservations(
  userId: string,
): Promise<ReservationRecord[]> {
  await ensureDb();
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))
    .all();
  return rows as ReservationRecord[];
}

/** How many collectors have reserved a concierge queue spot for this release.
 * Capped per `reservationCapForRelease()` (`lib/commerce/reservations.ts`) —
 * a real, enforced limit as of the reservation-scarcity cap, not just a
 * count. See `orders`' doc comment. */
export async function getReservationCountForRelease(
  discogsReleaseId: number,
): Promise<number> {
  await ensureDb();
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(orders)
    .where(eq(orders.discogsReleaseId, discogsReleaseId))
    .get();
  return result?.count ?? 0;
}

// --- Price history -----------------------------------------------------
// Powers real (non-batch-relative) fair value and wishlist price-drop alerts.
// Tracking is scoped to wishlisted releases only (deduped across users) —
// see handoff.md "Catalog search" era notes for why: bounded by real
// engagement, unlike snapshotting everything ever shown in Discover/Search.

/** Distinct wishlisted releases due for a snapshot, never-snapshotted and
 * least-recently-snapshotted first (SQLite sorts NULL first in ASC order, so
 * a release with no history yet always outranks one with stale history).
 * Capped by `limit` so one cron run's Discogs call count stays bounded no
 * matter how large the wishlist set grows — see scoreCandidates()'s
 * `candidates.slice(0, 25)` for the same rate-limit-aware capping pattern. */
export async function getReleaseIdsNeedingSnapshot(limit: number): Promise<number[]> {
  await ensureDb();
  const rows = await db
    .select({
      discogsReleaseId: wishlistItems.discogsReleaseId,
      lastSnapshot: sql<number | null>`max(${priceHistory.snapshotAt})`,
    })
    .from(wishlistItems)
    .leftJoin(priceHistory, eq(priceHistory.discogsReleaseId, wishlistItems.discogsReleaseId))
    .groupBy(wishlistItems.discogsReleaseId)
    .orderBy(sql`max(${priceHistory.snapshotAt}) asc`)
    .limit(limit)
    .all();
  return rows.map((r) => r.discogsReleaseId);
}

export async function insertPriceSnapshot(
  discogsReleaseId: number,
  lowestPrice: number | null,
  currency: string,
  numForSale: number,
): Promise<void> {
  await ensureDb();
  await db.insert(priceHistory).values({
    discogsReleaseId,
    lowestPrice,
    currency,
    numForSale,
    snapshotAt: new Date(),
  });
}

export async function getLatestPriceSnapshot(
  discogsReleaseId: number,
): Promise<{ lowestPrice: number | null; snapshotAt: Date } | null> {
  await ensureDb();
  const row = await db
    .select({ lowestPrice: priceHistory.lowestPrice, snapshotAt: priceHistory.snapshotAt })
    .from(priceHistory)
    .where(eq(priceHistory.discogsReleaseId, discogsReleaseId))
    .orderBy(desc(priceHistory.snapshotAt))
    .limit(1)
    .get();
  return row ?? null;
}

/** Batched per-release {count, median} of lowestPrice over the last `sinceDays`
 * — one query for a whole Discover/Search batch rather than N+1. Median (not
 * mean) so a single outlier listing doesn't skew the "is this actually cheap
 * for this record" baseline. Releases with no priced snapshots in the window
 * are simply absent from the returned map. */
export async function getPriceHistoryStatsForReleases(
  discogsReleaseIds: number[],
  sinceDays: number,
): Promise<Map<number, { count: number; median: number }>> {
  await ensureDb();
  if (discogsReleaseIds.length === 0) return new Map();

  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      discogsReleaseId: priceHistory.discogsReleaseId,
      lowestPrice: priceHistory.lowestPrice,
    })
    .from(priceHistory)
    .where(
      and(
        inArray(priceHistory.discogsReleaseId, discogsReleaseIds),
        gte(priceHistory.snapshotAt, since),
      ),
    )
    .all();

  const pricesByRelease = new Map<number, number[]>();
  for (const row of rows) {
    if (row.lowestPrice == null) continue;
    const list = pricesByRelease.get(row.discogsReleaseId) ?? [];
    list.push(row.lowestPrice);
    pricesByRelease.set(row.discogsReleaseId, list);
  }

  const stats = new Map<number, { count: number; median: number }>();
  for (const [id, prices] of pricesByRelease) {
    prices.sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const median =
      prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
    stats.set(id, { count: prices.length, median });
  }
  return stats;
}

export async function setWishlistPriceAtAdd(
  userId: string,
  discogsReleaseId: number,
  price: number | null,
): Promise<void> {
  await ensureDb();
  await db
    .update(wishlistItems)
    .set({ priceAtAdd: price })
    .where(
      and(eq(wishlistItems.userId, userId), eq(wishlistItems.discogsReleaseId, discogsReleaseId)),
    );
}

export interface WishlistAlertCandidate {
  wishlistItemId: number;
  userId: string;
  email: string | null;
  discogsReleaseId: number;
  title: string;
  artist: string;
  priceAtAdd: number | null;
  lastAlertedPrice: number | null;
  latestPrice: number | null;
}

/** Raw per-wishlist-item price data for every tracked item, for the cron job
 * to filter through the pure `findPriceDropAlerts()` (src/lib/commerce/price-alerts.ts)
 * before emailing. N+1 on `getLatestPriceSnapshot` is deliberate: these are
 * fast indexed local reads (not rate-limited Discogs calls), and this only
 * runs once daily, not per page load. */
export async function getWishlistAlertCandidates(): Promise<WishlistAlertCandidate[]> {
  await ensureDb();
  const rows = await db
    .select({
      wishlistItemId: wishlistItems.id,
      userId: wishlistItems.userId,
      email: users.email,
      discogsReleaseId: wishlistItems.discogsReleaseId,
      title: wishlistItems.title,
      artist: wishlistItems.artist,
      priceAtAdd: wishlistItems.priceAtAdd,
      lastAlertedPrice: wishlistItems.lastAlertedPrice,
    })
    .from(wishlistItems)
    .leftJoin(users, eq(users.id, wishlistItems.userId))
    .all();

  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      latestPrice: (await getLatestPriceSnapshot(row.discogsReleaseId))?.lowestPrice ?? null,
    })),
  );
}

export async function markWishlistAlerted(
  wishlistItemId: number,
  price: number,
): Promise<void> {
  await ensureDb();
  await db
    .update(wishlistItems)
    .set({ lastAlertedPrice: price })
    .where(eq(wishlistItems.id, wishlistItemId));
}

export interface LocalShop {
  id: number;
  name: string;
  domain: string;
  city: string | null;
  region: string | null;
}

/** Active local shops whose Shopify storefront the offer orchestrator should
 * search — see `src/lib/offers/shopify.ts`. No public claim/self-serve flow
 * yet; rows are added by hand via `addLocalShop`. */
export async function listActiveLocalShops(): Promise<LocalShop[]> {
  await ensureDb();
  return db
    .select({
      id: localShops.id,
      name: localShops.name,
      domain: localShops.domain,
      city: localShops.city,
      region: localShops.region,
    })
    .from(localShops)
    .where(eq(localShops.active, true))
    .all();
}

/** Register a local shop's Shopify storefront. `domain` must be unique — a
 * shop that already exists is left as-is rather than erroring, so this is
 * safe to call from a seed script run more than once. */
export async function addLocalShop(shop: {
  name: string;
  domain: string;
  city?: string | null;
  region?: string | null;
}): Promise<void> {
  await ensureDb();
  await db
    .insert(localShops)
    .values({
      name: shop.name,
      domain: shop.domain,
      city: shop.city ?? null,
      region: shop.region ?? null,
      active: true,
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: localShops.domain });
}

/** Cached "where to buy" offer result for one release. `offers`/`sources` are
 * deliberately untyped JSON here — `src/lib/offers/orchestrator.ts` owns the
 * real `Offer[]`/`SourceStatus[]` shapes and casts on read, so this module
 * doesn't need to import from `lib/offers`. */
export interface CachedOfferResult {
  offers: unknown;
  sources: unknown;
  fetchedAt: Date;
}

export async function getCachedOffers(
  discogsReleaseId: number,
): Promise<CachedOfferResult | null> {
  await ensureDb();
  const row = await db
    .select()
    .from(offerCache)
    .where(eq(offerCache.discogsReleaseId, discogsReleaseId))
    .get();

  if (!row || row.expiresAt < new Date()) return null;
  return {
    offers: parseJson(row.offers, []),
    sources: parseJson(row.sources, []),
    fetchedAt: row.createdAt,
  };
}

/** `now` is caller-supplied (not `new Date()` here) so the timestamp the
 * caller already returned to its own caller — e.g. a fresh `OfferResult`'s
 * `fetchedAt` — is bit-identical to what a subsequent cached read sees,
 * rather than two independently-generated `Date`s that round differently
 * once SQLite's second-precision integer timestamp storage truncates them. */
export async function cacheOffers(
  discogsReleaseId: number,
  offers: unknown,
  sources: unknown,
  ttlMs: number,
  now: Date = new Date(),
): Promise<void> {
  await ensureDb();
  const values = {
    discogsReleaseId,
    offers: JSON.stringify(offers),
    sources: JSON.stringify(sources),
    expiresAt: new Date(now.getTime() + ttlMs),
    createdAt: now,
  };

  await db
    .insert(offerCache)
    .values(values)
    .onConflictDoUpdate({ target: offerCache.discogsReleaseId, set: values });
}

/** Batch-reads DB-cached enrichment (price/rating/want/have) for a set of
 * releases in one query, so a page/row with several already-cached releases
 * costs one round trip instead of one per release. `data` is deliberately
 * untyped here — `lib/recommendations/enrich.ts` owns the real
 * `EnrichmentData` shape and casts on read, mirroring how `getCachedOffers`
 * keeps this module decoupled from the domain type it caches. */
export async function getCachedReleaseEnrichments(
  discogsReleaseIds: number[],
  currency: string,
): Promise<Map<number, unknown>> {
  await ensureDb();
  if (discogsReleaseIds.length === 0) return new Map();

  const rows = await db
    .select()
    .from(releaseEnrichmentCache)
    .where(
      and(
        inArray(releaseEnrichmentCache.discogsReleaseId, discogsReleaseIds),
        eq(releaseEnrichmentCache.currency, currency),
      ),
    )
    .all();

  const now = new Date();
  const result = new Map<number, unknown>();
  for (const row of rows) {
    if (row.expiresAt < now) continue;
    result.set(row.discogsReleaseId, parseJson(row.data, null));
  }
  return result;
}

export async function cacheReleaseEnrichment(
  discogsReleaseId: number,
  currency: string,
  data: unknown,
  ttlMs: number,
  now: Date = new Date(),
): Promise<void> {
  await ensureDb();
  const values = {
    discogsReleaseId,
    currency,
    data: JSON.stringify(data),
    expiresAt: new Date(now.getTime() + ttlMs),
    createdAt: now,
  };

  await db
    .insert(releaseEnrichmentCache)
    .values(values)
    .onConflictDoUpdate({
      target: [releaseEnrichmentCache.discogsReleaseId, releaseEnrichmentCache.currency],
      set: values,
    });
}

/** Batch-reads cached cover-art colors for a set of releases in one query —
 * same "one round trip, not one per release" motivation as
 * `getCachedReleaseEnrichments`. No expiry check: see `coverColorCache`. */
export async function getCachedCoverColors(
  discogsReleaseIds: number[],
): Promise<Map<number, string>> {
  await ensureDb();
  if (discogsReleaseIds.length === 0) return new Map();

  const rows = await db
    .select()
    .from(coverColorCache)
    .where(inArray(coverColorCache.discogsReleaseId, discogsReleaseIds))
    .all();

  return new Map(rows.map((row) => [row.discogsReleaseId, row.color]));
}

export async function cacheCoverColor(discogsReleaseId: number, color: string): Promise<void> {
  await ensureDb();
  const values = { discogsReleaseId, color, createdAt: new Date() };

  await db
    .insert(coverColorCache)
    .values(values)
    .onConflictDoUpdate({ target: coverColorCache.discogsReleaseId, set: values });
}

// --- Analytics events ---------------------------------------------------
// Success-metrics instrumentation. See lib/analytics/metrics.ts for the pure
// aggregation functions these wrap, and lib/analytics/types.ts for the fixed
// set of event types loggable here.

/** Never throws — a logging failure must not break the feature it's
 * instrumenting (same philosophy as the Resend email wrapper: log and move
 * on). */
export async function logEvent(
  userId: string,
  type: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await ensureDb();
    await db.insert(analyticsEvents).values({
      userId,
      type,
      metadata: JSON.stringify(metadata),
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("[analytics] logEvent failed:", error);
  }
}

export async function getAnalyticsEvents(types?: string[]): Promise<AnalyticsEventRow[]> {
  await ensureDb();
  const rows =
    types && types.length > 0
      ? await db.select().from(analyticsEvents).where(inArray(analyticsEvents.type, types)).all()
      : await db.select().from(analyticsEvents).all();

  return rows.map((r) => ({
    userId: r.userId,
    type: r.type,
    metadata: parseJson<Record<string, unknown>>(r.metadata, {}),
    createdAt: r.createdAt,
  }));
}

/** Convenience wrappers combining the fetch above with the pure aggregation
 * in lib/analytics/metrics.ts, for a script/REPL to call directly without
 * knowing which event types feed which metric. No dashboard UI calls these
 * yet — see handoff.md. */
export async function getReasonCitationRate() {
  return computeReasonCitationRate(await getAnalyticsEvents(["recommendations_generated"]));
}

export async function getFeedbackLikeRateBySource() {
  return computeFeedbackLikeRate(await getAnalyticsEvents(["feedback_given"]));
}

export async function getSyncToFirstRecommendationStats() {
  return computeSyncToFirstRecommendation(
    await getAnalyticsEvents(["spotify_sync_completed", "recommendations_generated"]),
  );
}

export async function getSearchToReservationFunnel() {
  return computeFunnel(
    await getAnalyticsEvents(["search_performed", "search_result_click", "reservation_created"]),
    ["search_performed", "search_result_click", "reservation_created"],
  );
}

export async function getEmailToReservationFunnel() {
  return computeFunnel(
    await getAnalyticsEvents(["price_drop_email_click", "reservation_created"]),
    ["price_drop_email_click", "reservation_created"],
  );
}
